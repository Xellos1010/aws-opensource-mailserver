#!/usr/bin/env node

import { getStackEvents, getFailedStackEvents, formatStackEvents } from '../src/lib/stack-events';

async function main() {
  const appPath = process.env['APP_PATH'];
  const stackName = process.env['STACK_NAME'];
  const domain = process.env['DOMAIN'];
  const region = process.env['AWS_REGION'];
  const profile = process.env['AWS_PROFILE'];
  const maxResults = process.env['MAX_RESULTS'] ? parseInt(process.env['MAX_RESULTS'], 10) : undefined;
  const failedOnly = process.env['FAILED_ONLY'] === '1' || process.env['FAILED_ONLY'] === 'true';

  try {
    const events = failedOnly
      ? await getFailedStackEvents({
          appPath,
          stackName,
          domain,
          region,
          profile,
          maxResults,
        })
      : await getStackEvents({
          appPath,
          stackName,
          domain,
          region,
          profile,
          maxResults,
        });

    console.log(formatStackEvents(events));

    if (failedOnly && events.length > 0) {
      console.log('\n⚠️  Failed events detected. Review the reasons above.');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error getting stack events:', error);
    process.exit(1);
  }
}

main();

