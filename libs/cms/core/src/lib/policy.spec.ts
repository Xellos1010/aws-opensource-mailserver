import { assertRole, assertSmsPolicy, DEFAULT_FEATURE_FLAGS } from './policy';

describe('policy', () => {
  it('blocks SMS when default flags are set', () => {
    expect(() => assertSmsPolicy(DEFAULT_FEATURE_FLAGS)).toThrow('SMS sending is disabled');
  });

  it('allows SMS when both flags are true', () => {
    expect(() =>
      assertSmsPolicy({
        emailEnabled: true,
        smsEnabled: true,
        smsCampaignApproved: true,
        webSoftphoneEnabled: false,
      })
    ).not.toThrow();
  });

  it('enforces role checks', () => {
    expect(() => assertRole(['caller'], ['owner'])).toThrow('requires one of');
    expect(() => assertRole(['owner'], ['owner'])).not.toThrow();
  });
});
