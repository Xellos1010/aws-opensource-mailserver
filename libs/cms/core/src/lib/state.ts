import {
  Account,
  AiActionItem,
  AiFollowUpSuggestion,
  AiSummary,
  AuditLog,
  Call,
  CallEvent,
  CallRecording,
  CallTranscript,
  CampaignApproval,
  Contact,
  ContactAvailability,
  ContactMethod,
  ContactStageHistoryEntry,
  FeatureFlags,
  FollowUp,
  Interaction,
  OutboundMessage,
  Reminder,
  Stage,
  Task,
  User,
  WebhookEventDedupe,
  CmsJob,
} from '@mm/cms-contracts';

export interface UserRecord extends User {
  passwordHash: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface CmsState {
  meta: {
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  users: UserRecord[];
  refreshTokens: RefreshTokenRecord[];
  accounts: Account[];
  contacts: Contact[];
  contactMethods: ContactMethod[];
  contactAvailability: ContactAvailability[];
  stages: Stage[];
  stageHistory: ContactStageHistoryEntry[];
  interactions: Interaction[];
  followUps: FollowUp[];
  tasks: Task[];
  reminders: Reminder[];
  calls: Call[];
  callEvents: CallEvent[];
  callRecordings: CallRecording[];
  callTranscripts: CallTranscript[];
  aiSummaries: AiSummary[];
  aiActionItems: AiActionItem[];
  aiFollowUps: AiFollowUpSuggestion[];
  messages: OutboundMessage[];
  messageEvents: MessageEvent[];
  featureFlags: FeatureFlags;
  campaignApprovals: CampaignApproval[];
  auditLogs: AuditLog[];
  webhookEventDedupe: WebhookEventDedupe[];
  jobs: CmsJob[];
  counters: Record<string, number>;
}

export interface MessageEvent {
  id: string;
  messageId: string;
  status: OutboundMessage['status'];
  rawPayload?: Record<string, unknown>;
  createdAt: string;
}
