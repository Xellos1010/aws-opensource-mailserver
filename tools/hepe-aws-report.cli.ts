#!/usr/bin/env tsx
/** Concise inventory: CFN stacks → cost/last-use; EC2/λ/EBS outside any stack. Default profile hepe-admin-mfa. */
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
import {
  DescribeInstancesCommand,
  DescribeRegionsCommand,
  DescribeVolumesCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';

const CE_REGION = 'us-east-1';
const CE_RES_DAYS = 14;
const EXTRAP = 30 / CE_RES_DAYS;

interface Opts {
  profile: string;
  regions: 'all' | string[];
  activityDays: number;
  out: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function ceEndExclusive(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function ceStartDays(end: Date, days: number): string {
  const s = new Date(end);
  s.setUTCDate(s.getUTCDate() - days);
  return iso(s);
}

function parseArgs(a: string[]): Opts {
  let profile = 'hepe-admin-mfa';
  let regions: 'all' | string[] = 'all';
  let activityDays = 14;
  let out = 'reports/hepe-full.md';
  for (let i = 0; i < a.length; i += 1) {
    const t = a[i];
    if (t === '--profile' && a[i + 1]) {
      profile = a[++i] ?? profile;
    } else if (t === '--regions' && a[i + 1]) {
      regions = a[i + 1]?.split(',').map((x) => x.trim()).filter(Boolean) ?? [];
      i += 1;
    } else if (t === '--activity-days' && a[i + 1]) {
      activityDays = Math.max(1, parseInt(a[++i] ?? '14', 10) || 14);
    } else if (t === '--out' && a[i + 1]) {
      out = a[++i] ?? out;
    }
  }
  return { profile, regions, activityDays, out };
}

async function regions(ec2: EC2Client, r: 'all' | string[]): Promise<string[]> {
  if (r !== 'all') {
    return [...r].sort();
  }
  const d = await ec2.send(new DescribeRegionsCommand({ AllRegions: false }));
  return (
    d.Regions?.filter((x) => x.OptInStatus === 'opt-in-not-required' || x.OptInStatus === 'opted-in')
      .map((x) => x.RegionName)
      .filter((n): n is string => Boolean(n)) ?? []
  )
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();
}

async function listStacks(cfn: CloudFormationClient): Promise<StackSummary[]> {
  const o: StackSummary[] = [];
  let n: string | undefined;
  do {
    const p = await cfn.send(new ListStacksCommand({ NextToken: n }));
    o.push(...(p.StackSummaries ?? []));
    n = p.NextToken;
  } while (n);
  return o;
}

async function stackRes(cfn: CloudFormationClient, name: string): Promise<StackResourceSummary[]> {
  const o: StackResourceSummary[] = [];
  let n: string | undefined;
  do {
    const p = await cfn.send(new ListStackResourcesCommand({ StackName: name, NextToken: n }));
    o.push(...(p.StackResourceSummaries ?? []));
    n = p.NextToken;
  } while (n);
  return o;
}

function lamName(phys: string): string {
  if (phys.includes(':function:')) {
    const x = phys.split(':function:')[1] ?? phys;
    return x.split(':')[0] ?? x;
  }
  return phys;
}

function albDim(arn: string): string | undefined {
  const m = arn.match(/loadbalancer\/(app|net)\/([^/]+)\/([^/]+)/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : undefined;
}

function parseTagKey(k: string): string {
  const i = k.indexOf('$');
  return i >= 0 ? k.slice(i + 1) : k;
}

async function stackTagUsdLastMonth(ce: CostExplorerClient): Promise<Map<string, number>> {
  const end = ceEndExclusive();
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 1);
  start.setUTCDate(1);
  const endLm = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const m = new Map<string, number>();
  let next: string | undefined;
  try {
    do {
      const r = await ce.send(
        new GetCostAndUsageCommand({
          TimePeriod: { Start: iso(start), End: iso(endLm) },
          Granularity: 'MONTHLY',
          Metrics: ['NetAmortizedCost'],
          GroupBy: [{ Type: 'TAG', Key: 'aws:cloudformation:stack-name' }],
          NextPageToken: next,
        })
      );
      for (const t of r.ResultsByTime ?? []) {
        for (const g of t.Groups ?? []) {
          const key = g.Keys?.[0];
          if (!key || key.includes('NoTagKey')) {
            continue;
          }
          const name = parseTagKey(key);
          const v = parseFloat(g.Metrics?.NetAmortizedCost?.Amount ?? '0');
          if (Number.isFinite(v)) {
            m.set(name, (m.get(name) ?? 0) + v);
          }
        }
      }
      next = r.NextPageToken;
    } while (next);
  } catch {
    /* no tag */
  }
  return m;
}

async function ceResByDim(
  ce: CostExplorerClient,
  service: string,
  dim: 'RESOURCE_ID',
  metric: string,
  start: string,
  end: string
): Promise<Map<string, number>> {
  const acc = new Map<string, number>();
  let next: string | undefined;
  try {
    do {
      const r = await ce.send(
        new GetCostAndUsageWithResourcesCommand({
          TimePeriod: { Start: start, End: end },
          Granularity: 'DAILY',
          Metrics: [metric],
          Filter: { Dimensions: { Key: 'SERVICE', Values: [service] } },
          GroupBy: [{ Type: 'DIMENSION', Key: dim }],
          NextPageToken: next,
        })
      );
      for (const t of r.ResultsByTime ?? []) {
        for (const g of t.Groups ?? []) {
          const k = g.Keys?.[0];
          if (!k) {
            continue;
          }
          const v = parseFloat(g.Metrics?.[metric]?.Amount ?? '0');
          if (Number.isFinite(v)) {
            acc.set(k, (acc.get(k) ?? 0) + v);
          }
        }
      }
      next = r.NextPageToken;
    } while (next);
  } catch {
    return new Map();
  }
  return acc;
}

function normEc2(k: string): string | undefined {
  if (k.startsWith('i-')) {
    return k;
  }
  const m = k.match(/instance\/(i-[0-9a-f]+)/i);
  return m?.[1];
}

function normLam(k: string): string | undefined {
  if (k.includes(':function:')) {
    return lamName(k);
  }
  if (k.startsWith('arn:aws:lambda:')) {
    const p = k.split(':');
    return p[6]?.split('/').pop();
  }
  return k.length > 0 && !k.startsWith('arn') ? k : undefined;
}

function mapEc2Cost(raw: Map<string, number>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [k, v] of raw) {
    const id = normEc2(k);
    if (id) {
      m.set(id, (m.get(id) ?? 0) + v);
    }
  }
  return m;
}

function mapLamCost(raw: Map<string, number>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [k, v] of raw) {
    const n = normLam(k);
    if (n) {
      m.set(n, (m.get(n) ?? 0) + v);
    }
  }
  return m;
}

async function cwLastEc2Busy(
  cw: CloudWatchClient,
  id: string,
  start: Date,
  end: Date,
  idle: number
): Promise<string> {
  const r = await cw.send(
    new GetMetricDataCommand({
      StartTime: start,
      EndTime: end,
      MetricDataQueries: [
        {
          Id: 'c',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'CPUUtilization',
              Dimensions: [{ Name: 'InstanceId', Value: id }],
            },
            Period: 3600,
            Stat: 'Maximum',
          },
        },
      ],
    })
  );
  const ts = r.MetricDataResults?.[0]?.Timestamps ?? [];
  const vs = r.MetricDataResults?.[0]?.Values ?? [];
  let last = '';
  for (let i = 0; i < ts.length; i += 1) {
    if ((vs[i] ?? 0) >= idle && ts[i]) {
      last = ts[i]!.toISOString().slice(0, 10);
    }
  }
  return last || 'idle';
}

async function cwLastLamInv(cw: CloudWatchClient, fn: string, start: Date, end: Date): Promise<string> {
  const r = await cw.send(
    new GetMetricDataCommand({
      StartTime: start,
      EndTime: end,
      MetricDataQueries: [
        {
          Id: 'i',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Invocations',
              Dimensions: [{ Name: 'FunctionName', Value: fn }],
            },
            Period: 86400,
            Stat: 'Sum',
          },
        },
      ],
    })
  );
  const ts = r.MetricDataResults?.[0]?.Timestamps ?? [];
  const vs = r.MetricDataResults?.[0]?.Values ?? [];
  let last = '';
  for (let i = 0; i < ts.length; i += 1) {
    if ((vs[i] ?? 0) > 0 && ts[i]) {
      last = ts[i]!.toISOString().slice(0, 10);
    }
  }
  return last || '0-inv';
}

async function cwAlbLast(cw: CloudWatchClient, dim: string, start: Date, end: Date): Promise<string> {
  const r = await cw.send(
    new GetMetricDataCommand({
      StartTime: start,
      EndTime: end,
      MetricDataQueries: [
        {
          Id: 'q',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApplicationELB',
              MetricName: 'RequestCount',
              Dimensions: [{ Name: 'LoadBalancer', Value: dim }],
            },
            Period: 86400,
            Stat: 'Sum',
          },
        },
      ],
    })
  );
  const ts = r.MetricDataResults?.[0]?.Timestamps ?? [];
  const vs = r.MetricDataResults?.[0]?.Values ?? [];
  let last = '';
  for (let i = 0; i < ts.length; i += 1) {
    if ((vs[i] ?? 0) > 0 && ts[i]) {
      last = ts[i]!.toISOString().slice(0, 10);
    }
  }
  return last || '0-req';
}

async function batchEc2Cw(
  cw: CloudWatchClient,
  ids: string[],
  start: Date,
  end: Date,
  idle: number
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const chunk = 250;
  for (let o = 0; o < ids.length; o += chunk) {
    const slice = ids.slice(o, o + chunk);
    const q = slice.map((id, j) => ({
      Id: `m${o + j}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/EC2',
          MetricName: 'CPUUtilization',
          Dimensions: [{ Name: 'InstanceId', Value: id }],
        },
        Period: 3600,
        Stat: 'Maximum',
      },
    }));
    const r = await cw.send(
      new GetMetricDataCommand({ StartTime: start, EndTime: end, MetricDataQueries: q })
    );
    for (let i = 0; i < slice.length; i += 1) {
      const id = slice[i]!;
      const res = r.MetricDataResults?.[i];
      const ts = res?.Timestamps ?? [];
      const vs = res?.Values ?? [];
      let last = '';
      for (let j = 0; j < ts.length; j += 1) {
        if ((vs[j] ?? 0) >= idle && ts[j]) {
          last = ts[j]!.toISOString().slice(0, 10);
        }
      }
      out.set(id, last || 'idle');
    }
  }
  return out;
}

async function batchLamCw(
  cw: CloudWatchClient,
  fns: string[],
  start: Date,
  end: Date
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const chunk = 250;
  for (let o = 0; o < fns.length; o += chunk) {
    const slice = fns.slice(o, o + chunk);
    const q = slice.map((fn, j) => ({
      Id: `l${o + j}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/Lambda',
          MetricName: 'Invocations',
          Dimensions: [{ Name: 'FunctionName', Value: fn }],
        },
        Period: 86400,
        Stat: 'Sum',
      },
    }));
    const r = await cw.send(new GetMetricDataCommand({ StartTime: start, EndTime: end, MetricDataQueries: q }));
    for (let i = 0; i < slice.length; i += 1) {
      const fn = slice[i]!;
      const res = r.MetricDataResults?.[i];
      const ts = res?.Timestamps ?? [];
      const vs = res?.Values ?? [];
      let last = '';
      for (let j = 0; j < ts.length; j += 1) {
        if ((vs[j] ?? 0) > 0 && ts[j]) {
          last = ts[j]!.toISOString().slice(0, 10);
        }
      }
      out.set(fn, last || '0-inv');
    }
  }
  return out;
}

interface Managed {
  ec2: Set<string>;
  lam: Set<string>;
  vol: Set<string>;
  alb: Set<string>;
  stackEc2: Map<string, Set<string>>;
  stackLam: Map<string, Set<string>>;
  stackAlb: Map<string, Set<string>>;
}

function emptyManaged(): Managed {
  return {
    ec2: new Set(),
    lam: new Set(),
    vol: new Set(),
    alb: new Set(),
    stackEc2: new Map(),
    stackLam: new Map(),
    stackAlb: new Map(),
  };
}

function addSet(m: Map<string, Set<string>>, stack: string, id: string): void {
  if (!m.has(stack)) {
    m.set(stack, new Set());
  }
  m.get(stack)!.add(id);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const cred = fromIni({ profile: opts.profile });
  const sts = new STSClient({ region: CE_REGION, credentials: cred });
  const id = await sts.send(new GetCallerIdentityCommand({}));
  const acct = id.Account ?? '';
  const ec2g = new EC2Client({ region: CE_REGION, credentials: cred });
  const regList = await regions(ec2g, opts.regions);
  const ce = new CostExplorerClient({ region: CE_REGION, credentials: cred });
  const end = ceEndExclusive();
  const ceStart = ceStartDays(end, CE_RES_DAYS);
  const ceEnd = iso(end);

  const [tagStackUsd, rawEc2Ce, rawLamCe] = await Promise.all([
    stackTagUsdLastMonth(ce),
    ceResByDim(
      ce,
      'Amazon Elastic Compute Cloud - Compute',
      'RESOURCE_ID',
      'UnblendedCost',
      ceStart,
      ceEnd
    ),
    ceResByDim(ce, 'AWS Lambda', 'RESOURCE_ID', 'UnblendedCost', ceStart, ceEnd),
  ]);
  const ec2Usd14 = mapEc2Cost(rawEc2Ce);
  const lamUsd14 = mapLamCost(rawLamCe);
  const ceWorks = ec2Usd14.size > 0 || lamUsd14.size > 0;

  const tEnd = new Date();
  const tStart = new Date();
  tStart.setUTCDate(tStart.getUTCDate() - opts.activityDays);

  const perRegion = new Map<string, Managed>();
  const stackMeta: { region: string; name: string; status: string }[] = [];

  for (const region of regList) {
    const cfn = new CloudFormationClient({ region, credentials: cred });
    const M = emptyManaged();
    perRegion.set(region, M);
    const stacks = await listStacks(cfn);
    for (const s of stacks) {
      if (s.StackStatus === 'DELETE_COMPLETE' || !s.StackName || !s.StackStatus) {
        continue;
      }
      const sn = s.StackName;
      stackMeta.push({ region, name: sn, status: s.StackStatus });
      let res: StackResourceSummary[] = [];
      try {
        res = await stackRes(cfn, sn);
      } catch {
        continue;
      }
      for (const r of res) {
        const t = r.ResourceType ?? '';
        const p = r.PhysicalResourceId ?? '';
        if (!p) {
          continue;
        }
        if (t === 'AWS::EC2::Instance') {
          M.ec2.add(p);
          addSet(M.stackEc2, sn, p);
        } else if (t === 'AWS::Lambda::Function') {
          const n = lamName(p);
          M.lam.add(n);
          addSet(M.stackLam, sn, n);
        } else if (t === 'AWS::EC2::Volume') {
          M.vol.add(p);
        } else if (t === 'AWS::ElasticLoadBalancingV2::LoadBalancer') {
          const d = albDim(p);
          if (d) {
            M.alb.add(d);
            addSet(M.stackAlb, sn, d);
          }
        }
      }
    }
  }

  const lines: string[] = [];
  lines.push(`# ${opts.profile} | ${acct} | ${utcNow()}`);
  lines.push(
    `CE~mo=14d Unblended EC2-compute+Lambda ×${EXTRAP.toFixed(3)} | tag$=prev mo NetAmortized \`aws:cloudformation:stack-name\` | CEres=${ceWorks ? 'on' : 'off'}`
  );
  lines.push('');
  lines.push('## stacks');
  lines.push('|region|stack|status|tag$|~ec2+L$|last|');
  lines.push('|-|-|-|-:|-:|-|');

  const cwByRegEc2 = new Map<string, Map<string, string>>();
  const cwByRegLam = new Map<string, Map<string, string>>();
  const cwByRegAlb = new Map<string, Map<string, string>>();
  const regionEc2Ids = new Map<string, string[]>();
  const regionLamFns = new Map<string, string[]>();

  for (const region of regList) {
    const M = perRegion.get(region)!;
    const ec2 = new EC2Client({ region, credentials: cred });
    const lam = new LambdaClient({ region, credentials: cred });
    const cw = new CloudWatchClient({ region, credentials: cred });

    const allEc2: string[] = [];
    let tok: string | undefined;
    do {
      const d = await ec2.send(new DescribeInstancesCommand({ NextToken: tok }));
      for (const rv of d.Reservations ?? []) {
        for (const ins of rv.Instances ?? []) {
          if (ins.InstanceId) {
            allEc2.push(ins.InstanceId);
          }
        }
      }
      tok = d.NextToken;
    } while (tok);
    regionEc2Ids.set(region, allEc2);
    cwByRegEc2.set(region, await batchEc2Cw(cw, allEc2, tStart, tEnd, 1));

    const allLam: string[] = [];
    let mt: string | undefined;
    do {
      const f = await lam.send(new ListFunctionsCommand({ Marker: mt }));
      for (const fn of f.Functions ?? []) {
        if (fn.FunctionName) {
          allLam.push(fn.FunctionName);
        }
      }
      mt = f.NextMarker;
    } while (mt);
    regionLamFns.set(region, allLam);
    cwByRegLam.set(region, await batchLamCw(cw, allLam, tStart, tEnd));

    const albCw = new Map<string, string>();
    for (const dim of M.alb) {
      albCw.set(dim, await cwAlbLast(cw, dim, tStart, tEnd));
    }
    cwByRegAlb.set(region, albCw);
  }

  const stackKeys = [...new Set(stackMeta.map((s) => `${s.region}\t${s.name}`))].sort();
  for (const key of stackKeys) {
    const [region, name] = key.split('\t');
    const st = stackMeta.find((x) => x.region === region && x.name === name)?.status ?? '';
    const M = perRegion.get(region)!;
    const tag = tagStackUsd.get(name);
    const tagS = tag !== undefined ? tag.toFixed(2) : '—';

    let ec2Lam14 = 0;
    const lastBits: string[] = [];
    for (const id of M.stackEc2.get(name) ?? []) {
      ec2Lam14 += ec2Usd14.get(id) ?? 0;
      lastBits.push(`${id}:${cwByRegEc2.get(region)?.get(id) ?? '?'}`);
    }
    for (const fn of M.stackLam.get(name) ?? []) {
      ec2Lam14 += lamUsd14.get(fn) ?? 0;
      lastBits.push(`${fn}:${cwByRegLam.get(region)?.get(fn) ?? '?'}`);
    }
    for (const dim of M.stackAlb.get(name) ?? []) {
      lastBits.push(`alb:${cwByRegAlb.get(region)?.get(dim) ?? '?'}`);
    }
    const approx = ceWorks ? (ec2Lam14 * EXTRAP).toFixed(2) : '—';
    const last = lastBits.length ? lastBits.slice(0, 6).join(';') + (lastBits.length > 6 ? '…' : '') : '—';
    lines.push(`|${region}|${name}|${st}|${tagS}|${approx}|${last}|`);
  }

  lines.push('');
  lines.push('## outside-cfn');
  lines.push('|kind|region|id|~$mo|last|');
  lines.push('|-|-|-|-:|-|');

  for (const region of regList) {
    const M = perRegion.get(region)!;
    const ec2 = new EC2Client({ region, credentials: cred });

    const orphansEc2 = (regionEc2Ids.get(region) ?? []).filter((iid) => !M.ec2.has(iid));
    for (const iid of orphansEc2) {
      const u14 = ec2Usd14.get(iid) ?? 0;
      const approx = ceWorks ? (u14 * EXTRAP).toFixed(2) : '—';
      const last = cwByRegEc2.get(region)?.get(iid) ?? '—';
      lines.push(`|ec2|${region}|${iid}|${approx}|${last}|`);
    }

    for (const n of regionLamFns.get(region) ?? []) {
      if (M.lam.has(n)) {
        continue;
      }
      const u14 = lamUsd14.get(n) ?? 0;
      const approx = ceWorks ? (u14 * EXTRAP).toFixed(2) : '—';
      const last = cwByRegLam.get(region)?.get(n) ?? '—';
      lines.push(`|lambda|${region}|${n}|${approx}|${last}|`);
    }

    let vt: string | undefined;
    do {
      const v = await ec2.send(new DescribeVolumesCommand({ NextToken: vt }));
      for (const vol of v.Volumes ?? []) {
        const vid = vol.VolumeId;
        const st = vol.State;
        if (!vid || M.vol.has(vid)) {
          continue;
        }
        if (st === 'available') {
          lines.push(`|ebs|${region}|${vid}|—|${st}|`);
        }
      }
      vt = v.NextToken;
    } while (vt);
  }

  lines.push('');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const outPath = path.isAbsolute(opts.out) ? opts.out : path.join(process.cwd(), opts.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, lines.join('\n'), 'utf8');
  // eslint-disable-next-line no-console
  console.log(outPath);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
