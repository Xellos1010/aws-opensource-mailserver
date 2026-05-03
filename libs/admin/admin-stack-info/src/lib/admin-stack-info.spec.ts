import { resolveDomain, resolveStackName } from './stack-info';

describe('stack-info resolution', () => {
  it('resolves observability-maintenance stack name from domain + app path', () => {
    expect(
      resolveStackName('example.com', 'apps/clients/cdk-client-example/observability-maintenance')
    ).toBe('example-com-mailserver-observability-maintenance');
  });

  it('auto-detects observability-maintenance stack type from app path without explicit domain', () => {
    expect(resolveStackName(undefined, 'apps/clients/cdk-client-example/observability-maintenance')).toBe(
      'example-com-mailserver-observability-maintenance'
    );
  });

  it('resolves domain from observability-maintenance app path', () => {
    expect(resolveDomain('apps/clients/cdk-client-example/observability-maintenance')).toBe(
      'example.com'
    );
  });

  it('resolves domain from canonical observability-maintenance stack name', () => {
    expect(resolveDomain(undefined, 'example-com-mailserver-observability-maintenance')).toBe(
      'example.com'
    );
  });
});
