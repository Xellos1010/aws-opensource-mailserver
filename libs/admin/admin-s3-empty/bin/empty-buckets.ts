#!/usr/bin/env node

import { emptyStackBuckets } from '../src/lib/empty-buckets';

async function main() {
  const appPath = process.env['APP_PATH'];
  const stackName = process.env['STACK_NAME'];
  const domain = process.env['DOMAIN'];
  const region = process.env['AWS_REGION'];
  const profile = process.env['AWS_PROFILE'];
  const dryRun = process.env['DRY_RUN'] === '1' || process.env['DRY_RUN'] === 'true';

  try {
    const result = await emptyStackBuckets({
      appPath,
      stackName,
      domain,
      region,
      profile,
      dryRun,
    });

    console.log('='.repeat(60));
    console.log('Summary:');
    console.log('='.repeat(60));
    console.log(`Total buckets processed: ${result.buckets.length}`);
    
    if (result.results.length > 0) {
      let totalVersions = 0;
      let totalMarkers = 0;
      
      for (const res of result.results) {
        totalVersions += res.versionsDeleted;
        totalMarkers += res.markersDeleted;
        console.log(`  ${res.bucket}: ${res.versionsDeleted} versions, ${res.markersDeleted} markers`);
      }
      
      console.log('');
      console.log(`Total: ${totalVersions} versions, ${totalMarkers} markers deleted`);
    }

    if (dryRun) {
      console.log('');
      console.log('⚠️  This was a dry run. No buckets were actually emptied.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error emptying stack buckets:', error);
    process.exit(1);
  }
}

main();

