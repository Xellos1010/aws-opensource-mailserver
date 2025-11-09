/**
 * Test configuration helpers
 */

import type { GoDaddyClientConfig } from '../lib/types';

export const createTestClientConfig = (overrides?: Partial<GoDaddyClientConfig>): GoDaddyClientConfig => ({
  apiKey: 'test-api-key',
  apiSecret: 'test-api-secret',
  baseUrl: 'https://api.ote-godaddy.com',
  ...overrides,
});

export const createTestDnsHostnamesConfig = () => ({
  domain: 'example.com',
  ns1Ip: '1.2.3.4',
  ns2Ip: '5.6.7.8',
  ttl: 3600,
});

export const createTestNameserversConfig = () => ({
  domain: 'example.com',
  customerId: 'test-customer-id',
  nameservers: ['ns1.box.example.com', 'ns2.box.example.com'],
});


