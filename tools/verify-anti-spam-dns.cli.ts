#!/usr/bin/env ts-node

/**
 * Verify Anti-Spam DNS (SPF, DKIM, DMARC, Mail-From)
 *
 * Checks that the mail domain has DNS records required to avoid being marked as spam:
 * - Apex SPF (authorizes sending hosts)
 * - DMARC at _dmarc.<domain> (receiver policy; p=quarantine or p=reject recommended)
 * - SES DKIM CNAMEs (from core stack)
 * - Mail-From MX + TXT for bounce handling and alignment
 *
 * Run via Nx: pnpm nx run cdk-emcnotary-instance:admin:verify:anti-spam-dns
 */

import * as dns from 'node:dns';
import { promisify } from 'node:util';
import { getStackInfoFromApp } from '@mm/admin-stack-info';

const resolveTxt = promisify(dns.resolveTxt);
const resolveMx = promisify(dns.resolveMx);
const resolveCname = promisify(dns.resolveCname);

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  expected?: string;
  found?: string;
}

interface VerifyOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  coreAppPath?: string;
}

async function resolveTxtFlat(hostname: string): Promise<string[]> {
  try {
    const results = await resolveTxt(hostname);
    return (results || []).flat().map((r) => (Array.isArray(r) ? r.join('') : String(r)));
  } catch {
    return [];
  }
}

async function resolveMxFlat(hostname: string): Promise<string[]> {
  try {
    const results = await resolveMx(hostname);
    return (results || []).map((r) => r.exchange.toLowerCase());
  } catch {
    return [];
  }
}

async function resolveCnameFlat(hostname: string): Promise<string[]> {
  try {
    const results = await resolveCname(hostname);
    return (results || []).map((r) => r.toLowerCase());
  } catch {
    return [];
  }
}

async function verifyAntiSpamDns(options: VerifyOptions): Promise<CheckResult[]> {
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const coreAppPath = options.coreAppPath || process.env.CORE_APP_PATH || 'apps/cdk-emc-notary/core';
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';

  if (!domain) {
    throw new Error('Domain is required. Set DOMAIN or pass --domain');
  }

  const results: CheckResult[] = [];
  const mailFromDomain = `mail.${domain}`;
  const dmarcDomain = `_dmarc.${domain}`;

  // 1. Apex SPF (root domain) – should authorize mail server and/or SES
  const apexTxt = await resolveTxtFlat(domain);
  const apexSpf = apexTxt.find((t) => t.includes('v=spf1'));
  if (apexSpf) {
    const hasMxOrInclude =
      apexSpf.includes('mx') ||
      apexSpf.includes('include:amazonses.com') ||
      apexSpf.includes('include:amazonaws.com');
    if (hasMxOrInclude) {
      results.push({
        name: 'Apex SPF',
        status: 'pass',
        message: 'Apex SPF authorizes sending (mx or amazonses)',
        found: apexSpf,
      });
    } else {
      results.push({
        name: 'Apex SPF',
        status: 'warn',
        message: 'Apex SPF present but may not authorize SES or MX; add include:amazonses.com or mx',
        found: apexSpf,
        expected: 'v=spf1 mx include:amazonses.com ~all',
      });
    }
  } else {
    results.push({
      name: 'Apex SPF',
      status: 'fail',
      message: 'No SPF TXT record at apex; mail may be marked as spam',
      expected: 'v=spf1 mx include:amazonses.com ~all',
    });
  }

  // 2. DMARC – recommended p=quarantine or p=reject
  const dmarcTxt = await resolveTxtFlat(dmarcDomain);
  const dmarc = dmarcTxt.find((t) => t.includes('v=DMARC1'));
  if (dmarc) {
    const hasPolicy = dmarc.includes('p=quarantine') || dmarc.includes('p=reject') || dmarc.includes('p=none');
    if (dmarc.includes('p=reject')) {
      results.push({
        name: 'DMARC',
        status: 'pass',
        message: 'DMARC policy rejects unaligned mail (strongest)',
        found: dmarc,
      });
    } else if (dmarc.includes('p=quarantine')) {
      results.push({
        name: 'DMARC',
        status: 'pass',
        message: 'DMARC policy quarantines unaligned mail',
        found: dmarc,
      });
    } else if (hasPolicy) {
      results.push({
        name: 'DMARC',
        status: 'warn',
        message: 'DMARC p=none only monitors; consider p=quarantine or p=reject',
        found: dmarc,
      });
    } else {
      results.push({
        name: 'DMARC',
        status: 'warn',
        message: 'DMARC record present but policy unclear',
        found: dmarc,
      });
    }
  } else {
    results.push({
      name: 'DMARC',
      status: 'fail',
      message: 'No DMARC record at _dmarc.<domain>; receivers may treat mail as less trustworthy',
      expected: 'v=DMARC1; p=quarantine; rua=mailto:admin@' + domain,
    });
  }

  // 3. Mail-From SPF (mail.<domain> TXT)
  const mailTxt = await resolveTxtFlat(mailFromDomain);
  const mailSpf = mailTxt.find((t) => t.includes('v=spf1') && t.includes('amazonses'));
  if (mailSpf) {
    results.push({
      name: 'Mail-From SPF',
      status: 'pass',
      message: 'Mail-From subdomain has SPF for SES',
      found: mailSpf,
    });
  } else {
    results.push({
      name: 'Mail-From SPF',
      status: 'fail',
      message: 'Missing or incorrect SPF for mail.<domain> (SES custom MAIL FROM)',
      expected: 'v=spf1 include:amazonses.com ~all',
    });
  }

  // 4. Mail-From MX (mail.<domain> MX)
  const mailMx = await resolveMxFlat(mailFromDomain);
  const hasSesMx = mailMx.some((m) => m.includes('amazonses.com'));
  if (hasSesMx) {
    results.push({
      name: 'Mail-From MX',
      status: 'pass',
      message: 'Mail-From subdomain has MX for SES bounces',
      found: mailMx.join(', '),
    });
  } else {
    results.push({
      name: 'Mail-From MX',
      status: 'fail',
      message: 'Missing MX for mail.<domain> (SES bounce handling)',
      expected: '10 feedback-smtp.<region>.amazonses.com',
    });
  }

  // 5. DKIM CNAMEs (from core stack)
  try {
    const stackInfo = await getStackInfoFromApp(coreAppPath, { domain, region, profile });
    const out = stackInfo.outputs as Record<string, string | undefined>;
    const dkimNames = [out['DkimDNSTokenName1'], out['DkimDNSTokenName2'], out['DkimDNSTokenName3']].filter(
      Boolean
    ) as string[];
    const dkimValues = [out['DkimDNSTokenValue1'], out['DkimDNSTokenValue2'], out['DkimDNSTokenValue3']].filter(
      Boolean
    ) as string[];

    if (dkimNames.length === 3 && dkimValues.length === 3) {
      let dkimPass = 0;
      for (let i = 0; i < 3; i++) {
        const cnames = await resolveCnameFlat(dkimNames[i]!);
        const expectedSuffix = '.dkim.amazonses.com';
        const ok = cnames.some((c) => c.includes('dkim.amazonses.com'));
        if (ok) dkimPass++;
      }
      if (dkimPass === 3) {
        results.push({
          name: 'DKIM (SES)',
          status: 'pass',
          message: 'All 3 SES DKIM CNAME records resolve correctly',
        });
      } else {
        results.push({
          name: 'DKIM (SES)',
          status: 'fail',
          message: `${dkimPass}/3 DKIM CNAMEs resolve to amazonses.com; missing records increase spam risk`,
          expected: 'CNAMEs for *_domainkey.<domain> → *.dkim.amazonses.com',
        });
      }
    } else {
      results.push({
        name: 'DKIM (SES)',
        status: 'warn',
        message: 'Could not load DKIM names from stack; run admin:ses:status to verify DKIM',
      });
    }
  } catch (err) {
    results.push({
      name: 'DKIM (SES)',
      status: 'warn',
      message: `Could not verify DKIM (stack lookup failed): ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return results;
}

function printResults(results: CheckResult[]): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Anti-Spam DNS Verification Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const pass = results.filter((r) => r.status === 'pass');
  const fail = results.filter((r) => r.status === 'fail');
  const warn = results.filter((r) => r.status === 'warn');

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} ${r.name}: ${r.message}`);
    if (r.found) console.log(`   Found: ${r.found}`);
    if (r.expected) console.log(`   Expected: ${r.expected}`);
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Summary: ${pass.length} pass, ${warn.length} warnings, ${fail.length} failures`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (fail.length > 0) {
    console.log('💡 To fix failures, add the missing DNS records at your DNS provider (e.g. GoDaddy).');
    console.log('   See: docs/EMCNOTARY-ANTI-SPAM-DNS.md or run: nx run cdk-emcnotary-instance:admin:ses-dns:print\n');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: VerifyOptions = {
    domain: process.env.DOMAIN,
    appPath: process.env.APP_PATH,
    coreAppPath: process.env.CORE_APP_PATH,
    region: process.env.AWS_REGION,
    profile: process.env.AWS_PROFILE,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--domain' || args[i] === '-d') options.domain = args[++i];
    else if (args[i] === '--app-path') options.appPath = args[++i];
    else if (args[i] === '--core-app-path') options.coreAppPath = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: verify-anti-spam-dns.cli.ts [options]

Verifies DNS records that help prevent mail from being marked as spam:
  - Apex SPF (authorizes sending)
  - DMARC at _dmarc.<domain> (p=quarantine or p=reject)
  - Mail-From MX + TXT (SES)
  - SES DKIM CNAMEs

Options:
  --domain, -d <domain>     Domain (e.g. emcnotary.com)
  --app-path <path>         Instance app path (for context)
  --core-app-path <path>    Core stack app path (for DKIM names)
  --help, -h                Show this help

Environment: DOMAIN, APP_PATH, CORE_APP_PATH, AWS_REGION, AWS_PROFILE
`);
      process.exit(0);
    }
  }
  if (!options.domain) options.domain = 'emcnotary.com';
  const results = await verifyAntiSpamDns(options);
  printResults(results);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
