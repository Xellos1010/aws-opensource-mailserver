import { CmsRole, FeatureFlags, User } from './entities';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface AuthSession {
  user: User;
  tokens: AuthTokens;
}

export interface PolicyBlockedErrorBody {
  code: 'POLICY_BLOCKED';
  message: string;
  policy: {
    smsEnabled: boolean;
    smsCampaignApproved: boolean;
  };
}

export interface ApiErrorBody {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface FeatureFlagsPatchRequest {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  smsCampaignApproved?: boolean;
  webSoftphoneEnabled?: boolean;
}

export interface CampaignApprovalRequest {
  approvalNote: string;
}

export interface CallerIdentity {
  userId: string;
  roles: CmsRole[];
}

export interface AuthenticatedRequestContext {
  requestId: string;
  actor: CallerIdentity;
}
