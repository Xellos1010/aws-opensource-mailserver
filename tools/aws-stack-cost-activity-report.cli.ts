#!/usr/bin/env tsx
/**
 * Billing-aligned costs + optional per-stack spend (cost allocation tag) +
 * recent usage signals from CloudWatch for key CFN-managed resources.
 *
 *   pnpm exec tsx --tsconfig tools/tsconfig.json tools/aws-stack-cost-activity-report.cli.ts \
 *     --profile hepe-admin-mfa [--regions us-east-1,eu-west-1] [--activity-days 14] [--out reports/aws-stack-cost-activity.md]
 *
 * Per-stack $ requires activating **Cost allocation tag**: `aws:cloudformation:stack-name`
 * (Billing → Cost allocation tags). Without it, the report still shows monthly account
 * totals (NetAmortizedCost / UnblendedCost) and service breakdown, plus usage activity by stack.
 */

import {
  CloudFormationClient,
  ListStackResourcesCommand,
  ListStacksCommand,
  type StackResourceSummary,
  type StackSummary,
} from '@aws-sdk/client-cloudformation';
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostAndUsageWithResourcesCommand,
  type GroupDefinition,
} from '@aws-sdk/client-cost-explorer';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { DescribeInstancesCommand, DescribeRegionsCommand, EC2Client, type Instance } from '@aws-sdk/client-ec2';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';

const CFN_TAG_STACK = 'aws:cloudformation:stack-name';

interface CliOptions {
  profile: string;
  regions: 'all' | string[];
  activityDays: number;
  idleCpuPct: number;
  costMonths: number;
  outPath?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** CE end date is exclusive (UTC midnight next day). */
function ceExclusiveEnd(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function ceStartMonthsBefore(exclusiveEnd: Date, wholeMonths: number): Date {
  const s = new Date(exclusiveEnd);
  s.setUTCMonth(s.getUTCMonth() - wholeMonths);
  s.setUTCDate(1);
  return s;
}

function parseArgs(argv: string[]): CliOptions {
  let profile = process.env.AWS_PROFILE ?? 'default';
  let regions: 'all' | string[] = 'all';
  let activityDays = 14;
  let idleCpuPct = 1.0;
  let costMonths = 6;
  let outPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--profile' && argv[i + 1]) {
      profile = argv[++i] ?? profile;
    } else if (a === '--regions' && argv[i + 1]) {
      regions = argv[++i]?.split(',').map((r) => r.trim()).filter(Boolean) ?? [];
    } else if (a === '--activity-days' && argv[i + 1]) {
      activityDays = Math.max(1, parseInt(argv[++i] ?? '14', 10) || 14);
    } else if (a === '--idle-cpu-pct' && argv[i + 1]) {
      idleCpuPct = parseFloat(argv[++i] ?? '1');
    } else if (a === '--cost-months' && argv[i + 1]) {
      costMonths = Math.max(1, Math.min(24, parseInt(argv[++i] ?? '6', 10) || 6));
    } else if (a === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    } else if (a === '--help' || a === '-h') {
      // eslint-disable-next-line no-console
      console.log(`See file header in tools/aws-stack-cost-activity-report.cli.ts`);
      process.exit(0);
    }
  }
  return { profile, regions, activityDays, idleCpuPct, costMonths, outPath };
}

async function resolveRegions(ec2: EC2Client, explicit: 'all' | string[]): Promise<string[]> {
  if (explicit !== 'all') {
    return [...explicit].sort();
  }
  const resp = await ec2.send(new DescribeRegionsCommand({ AllRegions: false }));
  return (
    resp.Regions?.filter(
      (r) => r.OptInStatus === 'opt-in-not-required' || r.OptInStatus === 'opted-in'
    )
      .map((r) => r.RegionName)
      .filter((n): n is string => Boolean(n)) ?? []
  )
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();
}

function splitSummaries(summaries: StackSummary[]): {
  retained: StackSummary[];
  deleted: StackSummary[];
} {
  const retained: StackSummary[] = [];
  const deleted: StackSummary[] = [];
  for (const s of summaries) {
    if (s.StackStatus === 'DELETE_COMPLETE') {
      deleted.push(s);
    } else {
      retained.push(s);
    }
  }
  return { retained, deleted };
}

async function listAllStacks(cfn: CloudFormationClient): Promise<StackSummary[]> {
  const out: StackSummary[] = [];
  let next: string | undefined;
  do {
    const p = await cfn.send(new ListStacksCommand({ NextToken: next }));
    out.push(...(p.StackSummaries ?? []));
    next = p.NextToken;
  } while (next);
  return out;
}

async function listResourcesForStack(
  cfn: CloudFormationClient,
  stackName: string
): Promise<StackResourceSummary[]> {
  const out: StackResourceSummary[] = [];
  let next: string | undefined;
  do {
    const p = await cfn.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: next }));
    out.push(...(p.StackResourceSummaries ?? []));
    next = p.NextToken;
  } while (next);
  return out;
}

function parseTagGroupKey(key: string): string {
  const i = key.indexOf('$');
  return i >= 0 ? key.slice(i + 1) : key;
}

async function fetchMonthlyTotals(
  ce: CostExplorerClient,
  start: string,
  end: string
): Promise<
  {
    monthStart: string;
    netAmortized: number;
    unblended: number;
    amortized: number;
  }[]
> {
  const resp = await ce.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: 'MONTHLY',
      Metrics: ['NetAmortizedCost', 'UnblendedCost', 'AmortizedCost'],
    })
  );
  return (
    resp.ResultsByTime?.map((t) => ({
      monthStart: t.TimePeriod?.Start ?? '',
      netAmortized: parseFloat(t.Total?.NetAmortizedCost?.Amount ?? '0'),
      unblended: parseFloat(t.Total?.UnblendedCost?.Amount ?? '0'),
      amortized: parseFloat(t.Total?.AmortizedCost?.Amount ?? '0'),
    })) ?? []
  );
}

async function fetchServiceTotalsForPeriod(
  ce: CostExplorerClient,
  start: string,
  end: string,
  metric: 'NetAmortizedCost' | 'UnblendedCost'
): Promise<{ service: string; usd: number }[]> {
  const map = new Map<string, number>();
  let next: string | undefined;
  const groupBy: GroupDefinition[] = [{ Type: 'DIMENSION', Key: 'SERVICE' }];
  const mkey = metric;
  do {
    const resp = await ce.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: start, End: end },
        Granularity: 'DAILY',
        Metrics: [mkey],
        GroupBy: groupBy,
        NextPageToken: next,
      })
    );
    for (const day of resp.ResultsByTime ?? []) {
      for (const g of day.Groups ?? []) {
        const svc = g.Keys?.[0] ?? 'Unknown';
        const amt = parseFloat(g.Metrics?.[mkey]?.Amount ?? '0');
        if (Number.isFinite(amt)) {
          map.set(svc, (map.get(svc) ?? 0) + amt);
        }
      }
    }
    next = resp.NextPageToken;
  } while (next);
  return [...map.entries()]
    .map(([service, usd]) => ({ service, usd }))
    .sort((a, b) => b.usd - a.usd);
}

async function fetchStackTagCosts(
  ce: CostExplorerClient,
  start: string,
  end: string
): Promise<{ stacks: { stackName: string; usd: number }[]; error?: string }> {
  const map = new Map<string, number>();
  let next: string | undefined;
  try {
    do {
      const resp = await ce.send(
        new GetCostAndUsageCommand({
          TimePeriod: { Start: start, End: end },
          Granularity: 'MONTHLY',
          Metrics: ['NetAmortizedCost'],
          GroupBy: [{ Type: 'TAG', Key: CFN_TAG_STACK }],
          NextPageToken: next,
        })
      );
      for (const t of resp.ResultsByTime ?? []) {
        for (const g of t.Groups ?? []) {
          const raw = g.Keys?.[0] ?? '';
          const name = parseTagGroupKey(raw);
          if (!name || name === 'NoTagKey' || raw.includes('No resource')) {
            continue;
          }
          const amt = parseFloat(g.Metrics?.NetAmortizedCost?.Amount ?? '0');
          if (Number.isFinite(amt)) {
            map.set(name, (map.get(name) ?? 0) + amt);
          }
        }
      }
      next = resp.NextPageToken;
    } while (next);
    return { stacks: [...map.entries()].map(([stackName, usd]) => ({ stackName, usd })).sort((a, b) => b.usd - a.usd) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { stacks: [], error: msg };
  }
}

async function fetchLinkedAccountCosts(
  ce: CostExplorerClient,
  start: string,
  end: string
): Promise<{ accounts: { id: string; usd: number }[]; error?: string }> {
  const map = new Map<string, number>();
  let next: string | undefined;
  try {
    do {
      const resp = await ce.send(
        new GetCostAndUsageCommand({
          TimePeriod: { Start: start, End: end },
          Granularity: 'MONTHLY',
          Metrics: ['NetAmortizedCost'],
          GroupBy: [{ Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' }],
          NextPageToken: next,
        })
      );
      for (const t of resp.ResultsByTime ?? []) {
        for (const g of t.Groups ?? []) {
          const id = g.Keys?.[0] ?? '';
          if (!id) {
            continue;
          }
          const amt = parseFloat(g.Metrics?.NetAmortizedCost?.Amount ?? '0');
          if (Number.isFinite(amt)) {
            map.set(id, (map.get(id) ?? 0) + amt);
          }
        }
      }
      next = resp.NextPageToken;
    } while (next);
    const accounts = [...map.entries()].map(([id, usd]) => ({ id, usd })).sort((a, b) => b.usd - a.usd);
    return accounts.length <= 1 ? { accounts: [] } : { accounts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { accounts: [], error: msg };
  }
}

function albDimensionFromArn(arn: string): string | undefined {
  const m = arn.match(/loadbalancer\/(app|net)\/([^/]+)\/([^/]+)/);
  if (!m) {
    return undefined;
  }
  return `${m[1]}/${m[2]}/${m[3]}`;
}

function lambdaShortName(physicalId: string): string {
  if (physicalId.includes(':function:')) {
    const part = physicalId.split(':function:')[1] ?? physicalId;
    const noVer = part.replace(/:\d+$/, '');
    return noVer.split(':')[0] ?? part;
  }
  return physicalId.split(':').pop() ?? physicalId;
}

function cwEnd(): Date {
  return new Date();
}

function cwStart(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/** Last N days for CE WithResources (API max 14). */
function ceResourceWindowDays(exclusiveEnd: Date, days: number): { start: string; end: string } {
  const end = isoDate(exclusiveEnd);
  const s = new Date(exclusiveEnd);
  s.setUTCDate(s.getUTCDate() - Math.min(14, days));
  return { start: isoDate(s), end };
}

function normalizeEc2InstanceId(resourceKey: string): string | undefined {
  if (resourceKey.startsWith('i-')) {
    return resourceKey;
  }
  const m = resourceKey.match(/instance\/(i-[0-9a-f]+)/i);
  return m?.[1];
}

/**
 * Per-EC2-instance UnblendedCost for EC2-Compute (last ≤14d). Maps instance id → USD.
 * Requires CE resource-level data (opt-in in some cases; may return sparse data).
 */
async function fetchEc2ComputeCostByInstance14d(
  ce: CostExplorerClient,
  exclusiveEnd: Date
): Promise<{ byInstance: Map<string, number>; error?: string; window: { start: string; end: string } }> {
  const { start, end } = ceResourceWindowDays(exclusiveEnd, 14);
  const byInstance = new Map<string, number>();
  try {
    let next: string | undefined;
    do {
      const resp = await ce.send(
        new GetCostAndUsageWithResourcesCommand({
          TimePeriod: { Start: start, End: end },
          Granularity: 'DAILY',
          Metrics: ['UnblendedCost'],
          Filter: {
            Dimensions: {
              Key: 'SERVICE',
              Values: ['Amazon Elastic Compute Cloud - Compute'],
            },
          },
          GroupBy: [{ Type: 'DIMENSION', Key: 'RESOURCE_ID' }],
          NextPageToken: next,
        })
      );
      for (const t of resp.ResultsByTime ?? []) {
        for (const g of t.Groups ?? []) {
          const key = g.Keys?.[0];
          if (!key) {
            continue;
          }
          const id = normalizeEc2InstanceId(key);
          if (!id) {
            continue;
          }
          const amt = parseFloat(g.Metrics?.UnblendedCost?.Amount ?? '0');
          if (Number.isFinite(amt)) {
            byInstance.set(id, (byInstance.get(id) ?? 0) + amt);
          }
        }
      }
      next = resp.NextPageToken;
    } while (next);
    return { byInstance, window: { start, end } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { byInstance, error: msg, window: { start, end } };
  }
}

async function ec2InstanceActivity(
  cw: CloudWatchClient,
  instanceId: string,
  start: Date,
  end: Date,
  idleCpuPct: number
): Promise<string> {
  const resp = await cw.send(
    new GetMetricDataCommand({
      StartTime: start,
      EndTime: end,
      MetricDataQueries: [
        {
          Id: 'cpu',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'CPUUtilization',
              Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
            },
            Period: 3600,
            Stat: 'Maximum',
          },
        },
      ],
    })
  );
  const ts = resp.MetricDataResults?.[0]?.Timestamps ?? [];
  const vals = resp.MetricDataResults?.[0]?.Values ?? [];
  let lastBusy: Date | undefined;
  for (let i = 0; i < ts.length; i += 1) {
    const v = vals[i];
    const t = ts[i];
    if (v !== undefined && t !== undefined && v >= idleCpuPct) {
      lastBusy = t;
    }
  }
  if (!lastBusy) {
    return `no hour ≥${idleCpuPct}% CPU (${Math.round((end.getTime() - start.getTime()) / 86400000)}d)`;
  }
  return `last hour ≥${idleCpuPct}% CPU: ${lastBusy.toISOString().slice(0, 16)}Z`;
}

async function lambdaInvocationActivity(
  cw: CloudWatchClient,
  fnName: string,
  start: Date,
  end: Date
): Promise<string> {
  const resp = await cw.send(
    new GetMetricDataCommand({
      StartTime: start,
      EndTime: end,
      MetricDataQueries: [
        {
          Id: 'inv',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Invocations',
              Dimensions: [{ Name: 'FunctionName', Value: fnName }],
            },
            Period: 86400,
            Stat: 'Sum',
          },
        },
      ],
    })
  );
  const ts = resp.MetricDataResults?.[0]?.Timestamps ?? [];
  const vals = resp.MetricDataResults?.[0]?.Values ?? [];
  let sum = 0;
  let lastDay: Date | undefined;
  for (let i = 0; i < ts.length; i += 1) {
    const v = vals[i] ?? 0;
    const t = ts[i];
    sum += v;
    if (v > 0 && t) {
      lastDay = t;
    }
  }
  if (sum === 0) {
    return `0 invocations (${Math.round((end.getTime() - start.getTime()) / 86400000)}d)`;
  }
  return `Σ invocations ${Math.round(sum)}; last day with traffic: ${lastDay?.toISOString().slice(0, 10) ?? '—'}`;
}

async function albRequestActivity(
  cw: CloudWatchClient,
  loadBalancerDim: string,
  start: Date,
  end: Date
): Promise<string> {
  const resp = await cw.send(
    new GetMetricDataCommand({
      StartTime: start,
      EndTime: end,
      MetricDataQueries: [
        {
          Id: 'req',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApplicationELB',
              MetricName: 'RequestCount',
              Dimensions: [{ Name: 'LoadBalancer', Value: loadBalancerDim }],
            },
            Period: 86400,
            Stat: 'Sum',
          },
        },
      ],
    })
  );
  const ts = resp.MetricDataResults?.[0]?.Timestamps ?? [];
  const vals = resp.MetricDataResults?.[0]?.Values ?? [];
  let sum = 0;
  let lastDay: Date | undefined;
  for (let i = 0; i < ts.length; i += 1) {
    const v = vals[i] ?? 0;
    const t = ts[i];
    sum += v;
    if (v > 0 && t) {
      lastDay = t;
    }
  }
  if (sum === 0) {
    return `0 requests (${Math.round((end.getTime() - start.getTime()) / 86400000)}d)`;
  }
  return `Σ requests ${Math.round(sum)}; last day with traffic: ${lastDay?.toISOString().slice(0, 10) ?? '—'}`;
}

async function describeEc2Map(
  ec2: EC2Client,
  instanceIds: string[]
): Promise<Map<string, Instance>> {
  const map = new Map<string, Instance>();
  const chunk = 100;
  for (let i = 0; i < instanceIds.length; i += chunk) {
    const slice = instanceIds.slice(i, i + chunk);
    if (slice.length === 0) {
      continue;
    }
    const r = await ec2.send(new DescribeInstancesCommand({ InstanceIds: slice }));
    for (const res of r.Reservations ?? []) {
      for (const ins of res.Instances ?? []) {
        if (ins.InstanceId) {
          map.set(ins.InstanceId, ins);
        }
      }
    }
  }
  return map;
}

interface StackResourceLine {
  region: string;
  stackName: string;
  resourceType: string;
  physicalId: string;
  stateOrName: string;
  activityNote: string;
  ec2Usd14dCe?: number;
}

async function collectStackActivity(
  region: string,
  credentials: ReturnType<typeof fromIni>,
  retainedStackNames: string[],
  activityDays: number,
  idleCpuPct: number,
  ec2CostByInstance: Map<string, number>
): Promise<StackResourceLine[]> {
  const cfn = new CloudFormationClient({ region, credentials });
  const ec2 = new EC2Client({ region, credentials });
  const cw = new CloudWatchClient({ region, credentials });
  const start = cwStart(activityDays);
  const end = cwEnd();

  const lines: StackResourceLine[] = [];
  const ec2Ids: { stack: string; id: string }[] = [];
  const lambdas: { stack: string; name: string }[] = [];
  const albs: { stack: string; dim: string; arn: string }[] = [];

  for (const stackName of retainedStackNames) {
    let resources: StackResourceSummary[] = [];
    try {
      resources = await listResourcesForStack(cfn, stackName);
    } catch {
      continue;
    }
    for (const r of resources) {
      const type = r.ResourceType ?? '';
      const phys = r.PhysicalResourceId ?? '';
      if (!phys || phys === 'null') {
        continue;
      }
      if (type === 'AWS::EC2::Instance') {
        ec2Ids.push({ stack: stackName, id: phys });
      } else if (type === 'AWS::Lambda::Function') {
        lambdas.push({ stack: stackName, name: lambdaShortName(phys) });
      } else if (type === 'AWS::ElasticLoadBalancingV2::LoadBalancer') {
        const dim = albDimensionFromArn(phys);
        if (dim) {
          albs.push({ stack: stackName, dim, arn: phys });
        }
      }
    }
  }

  const uniqEc2 = [...new Set(ec2Ids.map((x) => x.id))];
  const ec2Map = uniqEc2.length ? await describeEc2Map(ec2, uniqEc2) : new Map();

  for (const { stack, id } of ec2Ids) {
    const ins = ec2Map.get(id);
    const state = ins?.State?.Name ?? 'unknown';
    let note = '';
    try {
      note =
        state === 'running'
          ? await ec2InstanceActivity(cw, id, start, end, idleCpuPct)
          : `instance ${state} — no running CPU sample`;
    } catch (e) {
      note = e instanceof Error ? e.message : 'cw error';
    }
    lines.push({
      region,
      stackName: stack,
      resourceType: 'AWS::EC2::Instance',
      physicalId: id,
      stateOrName: state,
      activityNote: note,
      ec2Usd14dCe: ec2CostByInstance.get(id),
    });
  }

  for (const { stack, name } of lambdas) {
    let note = '';
    try {
      note = await lambdaInvocationActivity(cw, name, start, end);
    } catch (e) {
      note = e instanceof Error ? e.message : 'cw error';
    }
    lines.push({
      region,
      stackName: stack,
      resourceType: 'AWS::Lambda::Function',
      physicalId: name,
      stateOrName: 'lambda',
      activityNote: note,
    });
  }

  for (const { stack, dim } of albs) {
    let note = '';
    try {
      note = await albRequestActivity(cw, dim, start, end);
    } catch (e) {
      note = e instanceof Error ? e.message : 'cw error';
    }
    lines.push({
      region,
      stackName: stack,
      resourceType: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
      physicalId: dim,
      stateOrName: 'alb',
      activityNote: note,
    });
  }

  return lines;
}

function mdEscape(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const credentials = fromIni({ profile: opts.profile });
  const ce = new CostExplorerClient({ region: 'us-east-1', credentials });
  const sts = new STSClient({ region: 'us-east-1', credentials });
  const id = await sts.send(new GetCallerIdentityCommand({}));
  const ec2g = new EC2Client({ region: 'us-east-1', credentials });
  const regions = await resolveRegions(ec2g, opts.regions);

  const endD = ceExclusiveEnd();
  const startD = ceStartMonthsBefore(endD, opts.costMonths);
  const start = isoDate(startD);
  const end = isoDate(endD);

  const monthly = await fetchMonthlyTotals(ce, start, end).catch((e: unknown) => {
    throw new Error(`Cost Explorer monthly totals failed: ${e instanceof Error ? e.message : String(e)}`);
  });

  const lastMonthStart = isoDate(new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth() - 1, 1)));
  const lastMonthEnd = isoDate(new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth(), 1)));
  const servicesLastMonth = await fetchServiceTotalsForPeriod(ce, lastMonthStart, lastMonthEnd, 'NetAmortizedCost');

  const stackCosts = await fetchStackTagCosts(ce, start, end);
  const linked = await fetchLinkedAccountCosts(ce, start, end);
  const ec2ResCost = await fetchEc2ComputeCostByInstance14d(ce, endD);

  const costByStack = new Map(stackCosts.stacks.map((s) => [s.stackName, s.usd]));

  const lines: string[] = [];
  lines.push('# AWS stack cost and activity report');
  lines.push('');
  lines.push(`- **Account**: ${id.Account ?? 'unknown'} (profile \`${opts.profile}\`)`);
  lines.push(`- **Cost window (CE)**: \`${start}\` .. \`${end}\` (end exclusive), **NetAmortizedCost** + Unblended where noted`);
  lines.push(`- **Activity window**: last **${opts.activityDays}** days (CloudWatch; running EC2 uses hourly CPU max ≥ **${opts.idleCpuPct}%** as “busy”)`);
  lines.push(`- **Regions**: ${regions.join(', ')}`);
  lines.push('');
  lines.push('## Why numbers may differ from the console');
  lines.push('');
  lines.push(
    '- **NetAmortizedCost** includes amortized RIs/Savings Plans; **Unblended** is list usage. Billing pages, budgets, and tax can all differ from CE.'
  );
  lines.push(
    '- **If this account shows ~$0 but you expect ~$120/mo:** confirm you are using the **same account** as the Cost Explorer / Bills page (this report shows the account id in the header). For **Organizations**, open Cost Explorer in the **management (payer) account** or enable **Linked account** visibility; many charges only appear there.'
  );
  lines.push(
    '- If this profile is a **member account**, use the **Linked account** section below or re-run with the payer profile.'
  );
  lines.push(
    '- **Per-stack spend** needs cost allocation tag **`aws:cloudformation:stack-name`** (Billing → Cost allocation tags). Until then, EC2 lines include **Unblended EC2-compute for that instance over the last 14 days** via `GetCostAndUsageWithResources` (CE cap), not full monthly all-in cost.'
  );
  lines.push('');

  lines.push('## Monthly account totals (Cost Explorer)');
  lines.push('');
  lines.push('| Month (UTC) | NetAmortized | Unblended | Amortized |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const m of monthly) {
    const fmt = (x: number) => (Math.abs(x) < 0.01 && x !== 0 ? x.toFixed(4) : x.toFixed(2));
    lines.push(
      `| ${m.monthStart} | $${fmt(m.netAmortized)} | $${fmt(m.unblended)} | $${fmt(m.amortized)} |`
    );
  }
  lines.push('');

  lines.push('### EC2 compute — per instance (Cost Explorer, resource API)');
  lines.push('');
  if (ec2ResCost.error) {
    lines.push(`_Could not load resource-level EC2 costs:_ ${mdEscape(ec2ResCost.error)}`);
  } else {
    lines.push(
      `_Window \`${ec2ResCost.window.start}\` .. \`${ec2ResCost.window.end}\` (exclusive end), **UnblendedCost**, service EC2-Compute only._`
    );
    lines.push('');
    if (ec2ResCost.byInstance.size === 0) {
      lines.push('_No rows (resource-level CE empty, account has no EC2 compute charge in window, or feature not available)._');
    } else {
      lines.push('| Instance | USD (sum) |');
      lines.push('| --- | ---: |');
      for (const [id, usd] of [...ec2ResCost.byInstance.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`| \`${id}\` | $${usd.toFixed(4)} |`);
      }
    }
  }
  lines.push('');

  if (linked.accounts.length > 0) {
    lines.push('## Spend by linked account (same window, NetAmortized)');
    lines.push('');
    lines.push('| Account ID | USD |');
    lines.push('| --- | ---: |');
    for (const a of linked.accounts) {
      lines.push(`| ${a.id} | $${a.usd.toFixed(2)} |`);
    }
    lines.push('');
  }

  lines.push(`## Top services — previous calendar month (\`${lastMonthStart}\` .. \`${lastMonthEnd}\`, NetAmortized)`);
  lines.push('');
  lines.push('| Service | USD |');
  lines.push('| --- | ---: |');
  for (const s of servicesLastMonth.slice(0, 25)) {
    lines.push(`| ${mdEscape(s.service)} | $${s.usd.toFixed(2)} |`);
  }
  lines.push('');

  lines.push('## Per-stack cost (requires cost allocation tag on `aws:cloudformation:stack-name`)');
  lines.push('');
  if (stackCosts.error) {
    lines.push(`_Cost Explorer could not group by stack tag:_ ${mdEscape(stackCosts.error)}`);
    lines.push('');
  }
  if (stackCosts.stacks.length === 0) {
    lines.push('_No stack-tagged rows returned (tag likely not activated, or no spend in window)._');
  } else {
    lines.push('| Stack | NetAmortized (window) |');
    lines.push('| --- | ---: |');
    for (const s of stackCosts.stacks) {
      lines.push(`| ${mdEscape(s.stackName)} | $${s.usd.toFixed(2)} |`);
    }
  }
  lines.push('');

  lines.push('## Resource activity by stack (EC2 / Lambda / ALBv2 only)');
  lines.push('');
  lines.push(
    '_Classic ELB, RDS, NAT, S3, etc. are not analyzed here. “Idle” EC2 means no sampled hour exceeded the CPU threshold while **running**._'
  );
  lines.push('');

  const activityRows: StackResourceLine[] = [];
  for (const region of regions) {
    const cfn = new CloudFormationClient({ region, credentials });
    const { retained } = splitSummaries(await listAllStacks(cfn));
    const names = retained.map((s) => s.StackName).filter((n): n is string => Boolean(n));
    const chunk = await collectStackActivity(
      region,
      credentials,
      names,
      opts.activityDays,
      opts.idleCpuPct,
      ec2ResCost.byInstance
    );
    activityRows.push(...chunk);
  }

  const merged = activityRows.map((r) => ({
    ...r,
    stackUsd: costByStack.get(r.stackName),
  }));
  merged.sort((a, b) => {
    const ca = a.stackUsd ?? -1;
    const cb = b.stackUsd ?? -1;
    if (cb !== ca) {
      return cb - ca;
    }
    return `${a.region} ${a.stackName}`.localeCompare(`${b.region} ${b.stackName}`);
  });

  lines.push(
    '| Region | Stack | Stack $ (tag) | EC2 14d $ (CE) | Type | Id / dim | State | Activity |'
  );
  lines.push('| --- | --- | ---: | ---: | --- | --- | --- | --- |');
  for (const r of merged) {
    const tagUsd =
      r.stackUsd !== undefined && Number.isFinite(r.stackUsd) ? `$${r.stackUsd.toFixed(2)}` : '—';
    const ec2Usd =
      r.resourceType === 'AWS::EC2::Instance' && r.ec2Usd14dCe !== undefined && r.ec2Usd14dCe > 0
        ? `$${r.ec2Usd14dCe.toFixed(4)}`
        : r.resourceType === 'AWS::EC2::Instance' && r.ec2Usd14dCe !== undefined && r.ec2Usd14dCe === 0
          ? '$0.0000'
          : r.resourceType === 'AWS::EC2::Instance'
            ? '—'
            : '—';
    lines.push(
      `| ${r.region} | ${mdEscape(r.stackName)} | ${tagUsd} | ${ec2Usd} | ${mdEscape(r.resourceType)} | \`${mdEscape(r.physicalId)}\` | ${mdEscape(r.stateOrName)} | ${mdEscape(r.activityNote)} |`
    );
  }
  lines.push('');

  const body = `${lines.join('\n')}\n`;

  if (opts.outPath) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(opts.outPath, body, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Wrote ${opts.outPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(body);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
