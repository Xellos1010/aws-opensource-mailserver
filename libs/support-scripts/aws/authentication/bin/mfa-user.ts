#!/usr/bin/env node

import { main } from '../src/lib/mfa-user';

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

