import { resolveDomain, resolveStackName } from './stack-info';

describe('stack-info resolution', () => {
  it('resolves observability-maintenance stack name from domain + app path', () => {
    expect(
      resolveStackName('emcnotary.com', 'apps/cdk-emc-notary/observability-maintenance')
    ).toBe('emcnotary-com-mailserver-observability-maintenance');
  });

  it('auto-detects observability-maintenance stack type from app path without explicit domain', () => {
    expect(resolveStackName(undefined, 'apps/cdk-emc-notary/observability-maintenance')).toBe(
      'emcnotary-com-mailserver-observability-maintenance'
    );
  });

  it('resolves domain from observability-maintenance app path', () => {
    expect(resolveDomain('apps/cdk-emc-notary/observability-maintenance')).toBe(
      'emcnotary.com'
    );
  });

  it('resolves domain from canonical observability-maintenance stack name', () => {
    expect(resolveDomain(undefined, 'emcnotary-com-mailserver-observability-maintenance')).toBe(
      'emcnotary.com'
    );
  });
});
