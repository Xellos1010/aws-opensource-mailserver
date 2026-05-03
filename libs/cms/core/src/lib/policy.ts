import { CmsRole, FeatureFlags } from '@mm/cms-contracts';
import { ForbiddenError, PolicyBlockedError } from './errors';

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  emailEnabled: true,
  smsEnabled: false,
  smsCampaignApproved: false,
  webSoftphoneEnabled: false,
};

export function assertSmsPolicy(flags: FeatureFlags): void {
  if (!flags.smsEnabled || !flags.smsCampaignApproved) {
    throw new PolicyBlockedError('SMS sending is disabled until campaign approval.', {
      policy: {
        smsEnabled: flags.smsEnabled,
        smsCampaignApproved: flags.smsCampaignApproved,
      },
    });
  }
}

export function assertEmailPolicy(flags: FeatureFlags): void {
  if (!flags.emailEnabled) {
    throw new PolicyBlockedError('Email sending is disabled by feature policy.', {
      policy: {
        emailEnabled: flags.emailEnabled,
      },
    });
  }
}

export function assertRole(actorRoles: CmsRole[], allowed: CmsRole[]): void {
  const hasAllowedRole = actorRoles.some((role) => allowed.includes(role));
  if (!hasAllowedRole) {
    throw new ForbiddenError(`This operation requires one of: ${allowed.join(', ')}`);
  }
}
