/**
 * Unit tests for validation functions
 */

import { describe, it, expect } from 'vitest';
import {
  isValidIpv4,
  isValidDomain,
  isValidTtl,
  validateClientConfig,
  validateDnsHostnamesConfig,
  validateNameserversConfig,
} from '../lib/validation';

describe('isValidIpv4', () => {
  it('should validate correct IPv4 addresses', () => {
    expect(isValidIpv4('1.2.3.4')).toBe(true);
    expect(isValidIpv4('192.168.1.1')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
  });

  it('should reject invalid IPv4 addresses', () => {
    expect(isValidIpv4('256.1.1.1')).toBe(false);
    expect(isValidIpv4('1.1.1')).toBe(false);
    expect(isValidIpv4('1.1.1.1.1')).toBe(false);
    expect(isValidIpv4('not.an.ip.address')).toBe(false);
    expect(isValidIpv4('')).toBe(false);
  });
});

describe('isValidDomain', () => {
  it('should validate correct domain names', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('subdomain.example.com')).toBe(true);
    expect(isValidDomain('example.co.uk')).toBe(true);
  });

  it('should reject invalid domain names', () => {
    expect(isValidDomain('')).toBe(false);
    expect(isValidDomain('invalid..domain.com')).toBe(false);
    expect(isValidDomain('-invalid.com')).toBe(false);
    expect(isValidDomain('invalid-.com')).toBe(false);
  });
});

describe('isValidTtl', () => {
  it('should validate correct TTL values', () => {
    expect(isValidTtl(1)).toBe(true);
    expect(isValidTtl(3600)).toBe(true);
    expect(isValidTtl(2147483647)).toBe(true);
  });

  it('should reject invalid TTL values', () => {
    expect(isValidTtl(0)).toBe(false);
    expect(isValidTtl(-1)).toBe(false);
    expect(isValidTtl(2147483648)).toBe(false);
    expect(isValidTtl(1.5)).toBe(false);
  });
});

describe('validateClientConfig', () => {
  it('should validate correct configuration', () => {
    expect(() => {
      validateClientConfig({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });
    }).not.toThrow();
  });

  it('should reject missing apiKey', () => {
    expect(() => {
      validateClientConfig({
        apiKey: '',
        apiSecret: 'test-secret',
      } as unknown as Parameters<typeof validateClientConfig>[0]);
    }).toThrow('apiKey is required');
  });

  it('should reject missing apiSecret', () => {
    expect(() => {
      validateClientConfig({
        apiKey: 'test-key',
        apiSecret: '',
      } as unknown as Parameters<typeof validateClientConfig>[0]);
    }).toThrow('apiSecret is required');
  });

  it('should reject invalid timeout', () => {
    expect(() => {
      validateClientConfig({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        timeout: -1,
      });
    }).toThrow('timeout must be a positive integer');
  });

  it('should reject invalid maxRetries', () => {
    expect(() => {
      validateClientConfig({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        maxRetries: -1,
      });
    }).toThrow('maxRetries must be a non-negative integer');
  });
});

describe('validateDnsHostnamesConfig', () => {
  it('should validate correct configuration', () => {
    expect(() => {
      validateDnsHostnamesConfig({
        domain: 'example.com',
        ns1Ip: '1.2.3.4',
        ns2Ip: '5.6.7.8',
      });
    }).not.toThrow();
  });

  it('should reject invalid domain', () => {
    expect(() => {
      validateDnsHostnamesConfig({
        domain: 'invalid..domain',
        ns1Ip: '1.2.3.4',
        ns2Ip: '5.6.7.8',
      });
    }).toThrow('Invalid domain format');
  });

  it('should reject invalid ns1Ip', () => {
    expect(() => {
      validateDnsHostnamesConfig({
        domain: 'example.com',
        ns1Ip: '256.1.1.1',
        ns2Ip: '5.6.7.8',
      });
    }).toThrow('Invalid IPv4 address for ns1Ip');
  });

  it('should reject invalid ns2Ip', () => {
    expect(() => {
      validateDnsHostnamesConfig({
        domain: 'example.com',
        ns1Ip: '1.2.3.4',
        ns2Ip: 'invalid',
      });
    }).toThrow('Invalid IPv4 address for ns2Ip');
  });

  it('should reject invalid TTL', () => {
    expect(() => {
      validateDnsHostnamesConfig({
        domain: 'example.com',
        ns1Ip: '1.2.3.4',
        ns2Ip: '5.6.7.8',
        ttl: -1,
      });
    }).toThrow('Invalid TTL value');
  });
});

describe('validateNameserversConfig', () => {
  it('should validate correct configuration', () => {
    expect(() => {
      validateNameserversConfig({
        domain: 'example.com',
        customerId: '123',
      });
    }).not.toThrow();
  });

  it('should validate configuration with custom nameservers', () => {
    expect(() => {
      validateNameserversConfig({
        domain: 'example.com',
        customerId: '123',
        nameservers: ['ns1.example.com', 'ns2.example.com'],
      });
    }).not.toThrow();
  });

  it('should reject invalid domain', () => {
    expect(() => {
      validateNameserversConfig({
        domain: 'invalid..domain',
        customerId: '123',
      });
    }).toThrow('Invalid domain format');
  });

  it('should reject missing customerId', () => {
    expect(() => {
      validateNameserversConfig({
        domain: 'example.com',
        customerId: '',
      } as unknown as Parameters<typeof validateNameserversConfig>[0]);
    }).toThrow('customerId is required');
  });

  it('should reject insufficient nameservers', () => {
    expect(() => {
      validateNameserversConfig({
        domain: 'example.com',
        customerId: '123',
        nameservers: ['ns1.example.com'],
      });
    }).toThrow('At least two nameservers must be specified');
  });

  it('should reject too many nameservers', () => {
    expect(() => {
      validateNameserversConfig({
        domain: 'example.com',
        customerId: '123',
        nameservers: Array(14).fill('ns.example.com'),
      });
    }).toThrow('Maximum of 13 nameservers allowed');
  });

  it('should reject invalid nameserver format', () => {
    expect(() => {
      validateNameserversConfig({
        domain: 'example.com',
        customerId: '123',
        nameservers: ['invalid..nameserver', 'ns2.example.com'],
      });
    }).toThrow('Invalid nameserver format');
  });
});

