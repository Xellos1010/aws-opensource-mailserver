import { describe, it, expect } from 'vitest';
import {
  toKebabDomain,
  toMailserverCoreStackName,
  toMailserverInstanceStackName,
  parseDomainFromMailserverStack,
  coreParamPrefix,
} from './index';

describe('infra-naming', () => {
  describe('toKebabDomain', () => {
    it('converts domain to kebab-case', () => {
      expect(toKebabDomain('emcnotary.com')).toBe('emcnotary-com');
      expect(toKebabDomain('example.org')).toBe('example-org');
      expect(toKebabDomain('sub.example.com')).toBe('sub-example-com');
    });

    it('handles whitespace and case', () => {
      expect(toKebabDomain('  EMCNOTARY.COM  ')).toBe('emcnotary-com');
      expect(toKebabDomain('Example.Org')).toBe('example-org');
    });
  });

  describe('toMailserverCoreStackName', () => {
    it('generates canonical core stack name', () => {
      expect(toMailserverCoreStackName('emcnotary.com')).toBe(
        'emcnotary-com-mailserver-core'
      );
      expect(toMailserverCoreStackName('example.org')).toBe(
        'example-org-mailserver-core'
      );
    });
  });

  describe('toMailserverInstanceStackName', () => {
    it('generates canonical instance stack name', () => {
      expect(toMailserverInstanceStackName('emcnotary.com')).toBe(
        'emcnotary-com-mailserver-instance'
      );
      expect(toMailserverInstanceStackName('example.org')).toBe(
        'example-org-mailserver-instance'
      );
    });
  });

  describe('parseDomainFromMailserverStack', () => {
    it('parses domain from core stack name', () => {
      expect(
        parseDomainFromMailserverStack('emcnotary-com-mailserver-core')
      ).toBe('emcnotary.com');
      expect(
        parseDomainFromMailserverStack('example-org-mailserver-core')
      ).toBe('example.org');
    });

    it('parses domain from instance stack name', () => {
      expect(
        parseDomainFromMailserverStack('emcnotary-com-mailserver-instance')
      ).toBe('emcnotary.com');
      expect(
        parseDomainFromMailserverStack('example-org-mailserver-instance')
      ).toBe('example.org');
    });

    it('throws error for invalid stack names', () => {
      expect(() =>
        parseDomainFromMailserverStack('invalid-stack-name')
      ).toThrow('Not a canonical mailserver stack name');
      expect(() =>
        parseDomainFromMailserverStack('emcnotary-mailserver')
      ).toThrow('Not a canonical mailserver stack name');
      expect(() =>
        parseDomainFromMailserverStack('emcnotary-com-mailserver')
      ).toThrow('Not a canonical mailserver stack name');
    });
  });

  describe('coreParamPrefix', () => {
    it('generates SSM parameter prefix', () => {
      expect(coreParamPrefix('emcnotary.com')).toBe('/emcnotary/core');
      expect(coreParamPrefix('example.org')).toBe('/example/core');
    });
  });
});


