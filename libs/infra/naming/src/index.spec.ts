import { describe, it, expect } from 'vitest';
import {
  toKebabDomain,
  toMailserverCoreStackName,
  toMailserverInstanceStackName,
  toMailserverObservabilityMaintenanceStackName,
  parseDomainFromMailserverStack,
  coreParamPrefix,
  instanceParamPrefix,
} from './index';

describe('infra-naming', () => {
  describe('toKebabDomain', () => {
    it('converts domain to kebab-case', () => {
      expect(toKebabDomain('example.com')).toBe('example-com');
      expect(toKebabDomain('example.org')).toBe('example-org');
      expect(toKebabDomain('sub.example.com')).toBe('sub-example-com');
    });

    it('handles whitespace and case', () => {
      expect(toKebabDomain('  EXAMPLE.COM  ')).toBe('example-com');
      expect(toKebabDomain('Example.Org')).toBe('example-org');
    });
  });

  describe('toMailserverCoreStackName', () => {
    it('generates canonical core stack name', () => {
      expect(toMailserverCoreStackName('example.com')).toBe(
        'example-com-mailserver-core'
      );
      expect(toMailserverCoreStackName('example.org')).toBe(
        'example-org-mailserver-core'
      );
    });
  });

  describe('toMailserverInstanceStackName', () => {
    it('generates canonical instance stack name', () => {
      expect(toMailserverInstanceStackName('example.com')).toBe(
        'example-com-mailserver-instance'
      );
      expect(toMailserverInstanceStackName('example.org')).toBe(
        'example-org-mailserver-instance'
      );
    });
  });

  describe('toMailserverObservabilityMaintenanceStackName', () => {
    it('generates canonical observability-maintenance stack name', () => {
      expect(toMailserverObservabilityMaintenanceStackName('example.com')).toBe(
        'example-com-mailserver-observability-maintenance'
      );
      expect(toMailserverObservabilityMaintenanceStackName('example.org')).toBe(
        'example-org-mailserver-observability-maintenance'
      );
    });
  });

  describe('parseDomainFromMailserverStack', () => {
    it('parses domain from core stack name', () => {
      expect(
        parseDomainFromMailserverStack('example-com-mailserver-core')
      ).toBe('example.com');
      expect(
        parseDomainFromMailserverStack('example-org-mailserver-core')
      ).toBe('example.org');
    });

    it('parses domain from instance stack name', () => {
      expect(
        parseDomainFromMailserverStack('example-com-mailserver-instance')
      ).toBe('example.com');
      expect(
        parseDomainFromMailserverStack('example-org-mailserver-instance')
      ).toBe('example.org');
    });

    it('parses domain from observability-maintenance stack name', () => {
      expect(
        parseDomainFromMailserverStack(
          'example-com-mailserver-observability-maintenance'
        )
      ).toBe('example.com');
      expect(
        parseDomainFromMailserverStack('example-org-mailserver-observability-maintenance')
      ).toBe('example.org');
    });

    it('throws error for invalid stack names', () => {
      expect(() =>
        parseDomainFromMailserverStack('invalid-stack-name')
      ).toThrow('Not a canonical mailserver stack name');
      expect(() =>
        parseDomainFromMailserverStack('legacy-mailserver')
      ).toThrow('Not a canonical mailserver stack name');
      expect(() =>
        parseDomainFromMailserverStack('example-com-mailserver')
      ).toThrow('Not a canonical mailserver stack name');
    });
  });

  describe('coreParamPrefix', () => {
    it('generates SSM parameter prefix', () => {
      expect(coreParamPrefix('example.com')).toBe('/example/core');
      expect(coreParamPrefix('example.org')).toBe('/example/core');
    });
  });

  describe('instanceParamPrefix', () => {
    it('generates SSM parameter prefix', () => {
      expect(instanceParamPrefix('example.com')).toBe('/example/instance');
      expect(instanceParamPrefix('example.org')).toBe('/example/instance');
    });
  });
});



















