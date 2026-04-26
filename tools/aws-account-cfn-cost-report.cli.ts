#!/usr/bin/env tsx
/**
 * AWS account inventory: CloudFormation stacks, likely-orphan tagged resources,
 * and Cost Explorer spend (by service) for a lookback window.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tools/tsconfig.json tools/aws-account-cfn-cost-report.cli.ts \
 *     --profile hepe-admin-mfa [--regions us-east-1,us-west-2] [--days 30] [--format json|md] [--out path] \
 *     [--skip-resource-counts] [--include-deleted-stacks]
 *
 * Orphans (heuristic): resources in a region that still carry the managed tag
 * `aws:cloudformation:stack-name` pointing at a stack name that does not exist
 * in that region (stack deleted or rename drift). This does not find untagged
 * manual resources — only stale CloudFormation linkage.
 *
 * Costs: unblended USD by AWS service for the period. Per-stack costs require
 * activating `aws:cloudformation:stack-name` as a Cost Allocation Tag in Billing.
 */

import {
  CloudFormationClient,
  ListStackResourcesCommand,
  ListStacksCommand,
  type StackSummary,
} from '@aws-sdk/client-cloudformation';
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type GroupDefinition,
} from '@aws-sdk/client-cost-explorer';
import { DescribeRegionsCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
  type ResourceTagMapping,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';

const CFN_STACK_NAME_TAG = 'aws:cloudformation:stack-name';
const CFN_STACK_ID_TAG = 'aws:cloudformation:stack-id';

interface CliOptions {
  profile: string;
  regions: 'all' | string[];
  days: number;
  format: 'json' | 'md';
  outPath?: string;
  /** When true, skip ListStackResources pagination per stack (much faster). */
  skipResourceCounts: boolean;
  /** When true, markdown includes DELETE_COMPLETE history rows (can be long). */
  includeDeletedStacks: boolean;
}

interface StackRow {
  region: string;
  stackName: string;
  stackId: string;
  status: string;
  creationTime: string;
  lastUpdatedTime?: string;
  resourceCount: number;
}

interface OrphanRow {
  region: string;
  resourceArn: string;
  taggedStackName: string;
  taggedStackId?: string;
  reason: 'missing_stack_name' | 'missing_stack_id';
}

interface CostByServiceRow {
  service: string;
  amountUsd: number;
}

interface Report {
  generatedAt: string;
  accountId?: string;
  lookbackDays: number;
  costWindow: { start: string; end: string };
  regionsScanned: string[];
  /** Stacks that are not DELETE_COMPLETE (these retain or failed to release resources). */
  stacks: StackRow[];
  /** DELETE_COMPLETE records (same name can repeat after re-deploys); no live resources. */
  deletedStackHistory: StackRow[];
  stacksByStatus: Record<string, number>;
  orphanTaggedResources: OrphanRow[];
  costs: {
    byService: CostByServiceRow[];
    totalUsd: number;
    note?: string;
    error?: string;
  };
  caveats: string[];
}

function parseArgs(argv: string[]): CliOptions {
  let profile = process.env.AWS_PROFILE ?? 'default';
  let regions: 'all' | string[] = 'all';
  let days = 30;
  let format: 'json' | 'md' = 'md';
  let outPath: string | undefined;
  let skipResourceCounts = false;
  let includeDeletedStacks = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--profile' && argv[i + 1]) {
      profile = argv[++i] ?? profile;
    } else if (a === '--regions' && argv[i + 1]) {
      const raw = argv[++i] ?? '';
      regions = raw.split(',').map((r) => r.trim()).filter(Boolean);
    } else if (a === '--days' && argv[i + 1]) {
      days = Math.max(1, parseInt(argv[++i] ?? '30', 10) || 30);
    } else if (a === '--format' && argv[i + 1]) {
      const f = argv[++i] as 'json' | 'md';
      if (f !== 'json' && f !== 'md') {
        throw new Error('--format must be json or md');
      }
      format = f;
    } else if (a === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    } else if (a === '--skip-resource-counts') {
      skipResourceCounts = true;
    } else if (a === '--include-deleted-stacks') {
      includeDeletedStacks = true;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return { profile, regions, days, format, outPath, skipResourceCounts, includeDeletedStacks };
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`aws-account-cfn-cost-report.cli.ts

Inventory CloudFormation stacks, detect stale CloudFormation tags (orphan heuristic),
and summarize Cost Explorer spend by AWS service.

Options:
  --profile <name>     AWS config profile (default: AWS_PROFILE or "default")
  --regions <list>   Comma-separated regions (default: all opt-in / standard regions)
  --days <n>         Cost lookback in days (default: 30)
  --format json|md   Output format (default: md)
  --out <path>       Write report to file (UTF-8)
  --skip-resource-counts   Skip per-stack resource counts (faster API usage)
  --include-deleted-stacks Markdown: list DELETE_COMPLETE history (JSON always includes deletedStackHistory)
  -h, --help

Example:
  pnpm exec tsx --tsconfig tools/tsconfig.json tools/aws-account-cfn-cost-report.cli.ts \\
    --profile hepe-admin-mfa --days 30 --format md --out /tmp/aws-report.md
`);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Cost Explorer end date is exclusive; returns [start, end) as YYYY-MM-DD UTC. */
function costExplorerWindow(days: number): { start: string; end: string } {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { start: isoDate(start), end: isoDate(end) };
}

async function resolveRegions(
  ec2Global: EC2Client,
  explicit: 'all' | string[]
): Promise<string[]> {
  if (explicit !== 'all') {
    return [...explicit].sort();
  }
  const resp = await ec2Global.send(new DescribeRegionsCommand({ AllRegions: false }));
  const names =
    resp.Regions?.filter((r) => {
      const st = r.OptInStatus;
      return st === 'opt-in-not-required' || st === 'opted-in';
    })
      .map((r) => r.RegionName)
      .filter((n): n is string => Boolean(n)) ?? [];
  return [...new Set(names)].sort();
}

async function listAllStacks(cfn: CloudFormationClient): Promise<StackSummary[]> {
  const stacks: StackSummary[] = [];
  let next: string | undefined;
  do {
    const page = await cfn.send(
      new ListStacksCommand({
        NextToken: next,
      })
    );
    stacks.push(...(page.StackSummaries ?? []));
    next = page.NextToken;
  } while (next);
  return stacks;
}

function splitStackSummaries(summaries: StackSummary[]): {
  retained: StackSummary[];
  deletedHistory: StackSummary[];
} {
  const retained: StackSummary[] = [];
  const deletedHistory: StackSummary[] = [];
  for (const s of summaries) {
    if (s.StackStatus === 'DELETE_COMPLETE') {
      deletedHistory.push(s);
    } else {
      retained.push(s);
    }
  }
  return { retained, deletedHistory };
}

function stackRowsFromSummaries(
  region: string,
  summaries: StackSummary[],
  resourceCount: number
): StackRow[] {
  const rows: StackRow[] = [];
  for (const s of summaries) {
    const name = s.StackName;
    const id = s.StackId;
    const status = s.StackStatus;
    if (!name || !id || !status) {
      continue;
    }
    rows.push({
      region,
      stackName: name,
      stackId: id,
      status,
      creationTime: s.CreationTime?.toISOString() ?? '',
      lastUpdatedTime: s.LastUpdatedTime?.toISOString(),
      resourceCount,
    });
  }
  return rows;
}

async function countStackResources(cfn: CloudFormationClient, stackName: string): Promise<number> {
  let count = 0;
  let next: string | undefined;
  do {
    const page = await cfn.send(
      new ListStackResourcesCommand({ StackName: stackName, NextToken: next })
    );
    count += page.StackResourceSummaries?.length ?? 0;
    next = page.NextToken;
  } while (next);
  return count;
}

async function enrichStacks(
  cfn: CloudFormationClient,
  region: string,
  summaries: StackSummary[],
  skipResourceCounts: boolean
): Promise<StackRow[]> {
  const rows: StackRow[] = [];
  for (const s of summaries) {
    const name = s.StackName;
    const id = s.StackId;
    const status = s.StackStatus;
    if (!name || !id || !status) {
      continue;
    }
    const resourceCount = skipResourceCounts ? -1 : await countStackResources(cfn, name);
    rows.push({
      region,
      stackName: name,
      stackId: id,
      status,
      creationTime: s.CreationTime?.toISOString() ?? '',
      lastUpdatedTime: s.LastUpdatedTime?.toISOString(),
      resourceCount,
    });
  }
  return rows;
}

function tagValue(tags: ResourceTagMapping['Tags'], key: string): string | undefined {
  if (!tags) {
    return undefined;
  }
  return tags[key];
}

async function listResourcesWithCfnStackNameTag(
  tagging: ResourceGroupsTaggingAPIClient
): Promise<ResourceTagMapping[]> {
  const out: ResourceTagMapping[] = [];
  let token: string | undefined;
  do {
    const page = await tagging.send(
      new GetResourcesCommand({
        PaginationToken: token,
        TagFilters: [{ Key: CFN_STACK_NAME_TAG }],
      })
    );
    out.push(...(page.ResourceTagMappingList ?? []));
    token = page.PaginationToken || undefined;
  } while (token);
  return out;
}

function findOrphans(
  region: string,
  resources: ResourceTagMapping[],
  activeStackNames: Set<string>,
  activeStackIds: Set<string>
): OrphanRow[] {
  const orphans: OrphanRow[] = [];
  for (const m of resources) {
    const arn = m.ResourceARN;
    const stackName = tagValue(m.Tags, CFN_STACK_NAME_TAG);
    const stackId = tagValue(m.Tags, CFN_STACK_ID_TAG);
    if (!arn || !stackName) {
      continue;
    }
    const nameMissing = !activeStackNames.has(stackName);
    const idMissing = stackId ? !activeStackIds.has(stackId) : false;
    if (nameMissing) {
      orphans.push({
        region,
        resourceArn: arn,
        taggedStackName: stackName,
        taggedStackId: stackId,
        reason: 'missing_stack_name',
      });
    } else if (idMissing) {
      orphans.push({
        region,
        resourceArn: arn,
        taggedStackName: stackName,
        taggedStackId: stackId,
        reason: 'missing_stack_id',
      });
    }
  }
  return orphans;
}

async function fetchCostByService(
  ce: CostExplorerClient,
  start: string,
  end: string
): Promise<{ rows: CostByServiceRow[]; totalUsd: number; error?: string; note?: string }> {
  const groupBy: GroupDefinition[] = [{ Type: 'DIMENSION', Key: 'SERVICE' }];
  let next: string | undefined;
  const amounts = new Map<string, number>();

  try {
    do {
      const resp = await ce.send(
        new GetCostAndUsageCommand({
          TimePeriod: { Start: start, End: end },
          Granularity: 'DAILY',
          Metrics: ['UnblendedCost'],
          GroupBy: groupBy,
          NextPageToken: next,
        })
      );
      for (const day of resp.ResultsByTime ?? []) {
        for (const g of day.Groups ?? []) {
          const service = g.Keys?.[0] ?? 'Unknown';
          const amt = g.Metrics?.UnblendedCost?.Amount ?? '0';
          const n = parseFloat(amt);
          if (!Number.isFinite(n)) {
            continue;
          }
          amounts.set(service, (amounts.get(service) ?? 0) + n);
        }
      }
      next = resp.NextPageToken;
    } while (next);

    const rows: CostByServiceRow[] = [...amounts.entries()]
      .map(([service, amountUsd]) => ({ service, amountUsd }))
      .sort((a, b) => b.amountUsd - a.amountUsd);
    const totalUsd = rows.reduce((s, r) => s + r.amountUsd, 0);
    return {
      rows,
      totalUsd,
      note:
        'Costs are summed UnblendedCost (DAILY, Cost Explorer) by AWS service. Per-stack breakdown needs activating `aws:cloudformation:stack-name` as a cost allocation tag.',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { rows: [], totalUsd: 0, error: msg };
  }
}

function countByStatus(stacks: StackRow[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of stacks) {
    m[s.status] = (m[s.status] ?? 0) + 1;
  }
  return m;
}

function isStableSuccess(status: string): boolean {
  return status === 'CREATE_COMPLETE' || status === 'UPDATE_COMPLETE';
}

function renderMarkdown(report: Report, includeDeletedStacks: boolean): string {
  const lines: string[] = [];
  lines.push('# AWS CloudFormation and cost report');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Account: ${report.accountId ?? 'unknown'}`);
  lines.push(
    `- Cost window: ${report.costWindow.start} .. ${report.costWindow.end} (${report.lookbackDays} day lookback; CE end date is exclusive)`
  );
  lines.push(`- Regions scanned: ${report.regionsScanned.join(', ')}`);
  lines.push('');

  lines.push('## Caveats');
  for (const c of report.caveats) {
    lines.push(`- ${c}`);
  }
  lines.push('');

  lines.push('## Stacks by status');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('| --- | ---: |');
  for (const [status, n] of Object.entries(report.stacksByStatus).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${status} | ${n} |`);
  }
  lines.push('');

  lines.push('## CloudFormation stacks (non-deleted)');
  lines.push('');
  lines.push(
    '_Only stacks not in `DELETE_COMPLETE`. Deleted runs of the same stack name appear under history._'
  );
  lines.push('');
  lines.push('| Region | Stack | Status | Resources | Created |');
  lines.push('| --- | --- | --- | ---: | --- |');
  for (const s of report.stacks.sort((a, b) =>
    `${a.region} ${a.stackName}`.localeCompare(`${b.region} ${b.stackName}`)
  )) {
    const name = s.stackName.replace(/\|/g, '\\|');
    const rc = s.resourceCount < 0 ? '—' : String(s.resourceCount);
    lines.push(`| ${s.region} | ${name} | ${s.status} | ${rc} | ${s.creationTime.slice(0, 10)} |`);
  }
  lines.push('');

  const review = report.stacks.filter((s) => !isStableSuccess(s.status));
  lines.push('## Stacks to review (not CREATE_COMPLETE / UPDATE_COMPLETE)');
  lines.push('');
  if (review.length === 0) {
    lines.push('_None in scanned regions._');
  } else {
    lines.push('| Region | Stack | Status | Resources |');
    lines.push('| --- | --- | --- | ---: |');
    for (const s of review.sort((a, b) =>
      `${a.region} ${a.stackName}`.localeCompare(`${b.region} ${b.stackName}`)
    )) {
      const name = s.stackName.replace(/\|/g, '\\|');
      const rc = s.resourceCount < 0 ? '—' : String(s.resourceCount);
      lines.push(`| ${s.region} | ${name} | ${s.status} | ${rc} |`);
    }
  }
  lines.push('');

  lines.push('## DELETE_COMPLETE history');
  lines.push('');
  lines.push(
    `_${report.deletedStackHistory.length} record(s). These do not hold CloudFormation-managed resources; same stack name can repeat after deletes._`
  );
  lines.push('');
  if (includeDeletedStacks && report.deletedStackHistory.length > 0) {
    lines.push('| Region | Stack | Stack ID (suffix) | Created |');
    lines.push('| --- | --- | --- | --- |');
    for (const s of report.deletedStackHistory.sort((a, b) =>
      `${a.region} ${a.creationTime}`.localeCompare(`${b.region} ${b.creationTime}`)
    )) {
      const name = s.stackName.replace(/\|/g, '\\|');
      const idSuffix = s.stackId.split('/').pop()?.replace(/\|/g, '\\|') ?? s.stackId;
      lines.push(`| ${s.region} | ${name} | \`${idSuffix}\` | ${s.creationTime.slice(0, 10)} |`);
    }
    lines.push('');
  } else if (report.deletedStackHistory.length > 0) {
    lines.push('_Omitted from markdown for size. Use `--include-deleted-stacks` or read `deletedStackHistory` in JSON._');
    lines.push('');
  }

  lines.push('## Likely orphan resources (stale CloudFormation tags)');
  lines.push('');
  if (report.orphanTaggedResources.length === 0) {
    lines.push('_None detected for scanned regions._');
  } else {
    lines.push('| Region | Tagged stack | ARN | Reason |');
    lines.push('| --- | --- | --- | --- |');
    for (const o of report.orphanTaggedResources) {
      const arn = o.resourceArn.replace(/\|/g, '\\|');
      lines.push(`| ${o.region} | ${o.taggedStackName} | \`${arn}\` | ${o.reason} |`);
    }
  }
  lines.push('');

  lines.push('## Costs by AWS service (Cost Explorer)');
  lines.push('');
  if (report.costs.error) {
    lines.push(`_Cost Explorer unavailable: ${report.costs.error}_`);
  } else {
    if (report.costs.note) {
      lines.push(`_${report.costs.note}_`);
      lines.push('');
    }
    const totalLabel =
      Math.abs(report.costs.totalUsd) < 0.005 && report.costs.totalUsd !== 0
        ? `~$${report.costs.totalUsd.toFixed(4)}`
        : `$${report.costs.totalUsd.toFixed(2)}`;
    lines.push(`**Total (approx):** ${totalLabel}`);
    lines.push('');
    lines.push('| Service | USD |');
    lines.push('| --- | ---: |');
    for (const r of report.costs.byService.slice(0, 40)) {
      lines.push(`| ${r.service.replace(/\|/g, '\\|')} | ${r.amountUsd.toFixed(2)} |`);
    }
    if (report.costs.byService.length > 40) {
      lines.push('');
      lines.push(`_… ${report.costs.byService.length - 40} more services in JSON._`);
    }
  }

  return `${lines.join('\n')}\n`;
}

async function writeOut(path: string, body: string): Promise<void> {
  const fs = await import('node:fs/promises');
  await fs.writeFile(path, body, 'utf8');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const credentials = fromIni({ profile: opts.profile });
  const costWindow = costExplorerWindow(opts.days);

  const sts = new STSClient({ region: 'us-east-1', credentials });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;

  const ec2Global = new EC2Client({ region: 'us-east-1', credentials });
  const regions = await resolveRegions(ec2Global, opts.regions);

  const retainedStacks: StackRow[] = [];
  const deletedStacks: StackRow[] = [];
  const allOrphans: OrphanRow[] = [];

  for (const region of regions) {
    const cfn = new CloudFormationClient({ region, credentials });
    const tagging = new ResourceGroupsTaggingAPIClient({ region, credentials });

    const summaries = await listAllStacks(cfn);
    const { retained, deletedHistory } = splitStackSummaries(summaries);

    const activeNames = new Set(
      retained.map((s) => s.StackName).filter((n): n is string => Boolean(n))
    );
    const activeIds = new Set(retained.map((s) => s.StackId).filter((n): n is string => Boolean(n)));

    const rows = await enrichStacks(cfn, region, retained, opts.skipResourceCounts);
    retainedStacks.push(...rows);
    deletedStacks.push(...stackRowsFromSummaries(region, deletedHistory, 0));

    let tagged: ResourceTagMapping[] = [];
    try {
      tagged = await listResourcesWithCfnStackNameTag(tagging);
    } catch {
      // Some accounts/regions restrict tagging API
    }
    allOrphans.push(...findOrphans(region, tagged, activeNames, activeIds));
  }

  const ce = new CostExplorerClient({ region: 'us-east-1', credentials });
  const costResult = await fetchCostByService(ce, costWindow.start, costWindow.end);

  const caveats = [
    'Orphan detection uses only stacks **not** in `DELETE_COMPLETE` as the live name/id set; resources tagged with an old deleted stack id are reported as `missing_stack_id`.',
    'Orphan detection only covers resources returned by Resource Groups Tagging API that still have `aws:cloudformation:stack-name` but no matching active stack in the same region.',
    'Untagged resources or resources never managed by CloudFormation are not listed here.',
    'Cost Explorer must be enabled for the payer account; data can lag up to 24 hours.',
    'DELETE_FAILED and UPDATE_ROLLBACK_COMPLETE stacks remain billable until resources are removed or the stack is fixed.',
  ];

  const report: Report = {
    generatedAt: new Date().toISOString(),
    accountId: accountId ?? undefined,
    lookbackDays: opts.days,
    costWindow: costWindow,
    regionsScanned: regions,
    stacks: retainedStacks,
    deletedStackHistory: deletedStacks,
    stacksByStatus: countByStatus([...retainedStacks, ...deletedStacks]),
    orphanTaggedResources: allOrphans,
    costs: {
      byService: costResult.rows,
      totalUsd: costResult.totalUsd,
      note: costResult.note,
      error: costResult.error,
    },
    caveats,
  };

  const body =
    opts.format === 'json'
      ? JSON.stringify(report, null, 2)
      : renderMarkdown(report, opts.includeDeletedStacks);

  if (opts.outPath) {
    await writeOut(opts.outPath, body);
    // eslint-disable-next-line no-console
    console.log(`Wrote ${opts.outPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(body);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
