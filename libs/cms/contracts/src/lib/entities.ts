export type CmsRole = 'owner' | 'manager' | 'caller';

export type ContactStageId =
  | 'new'
  | 'contacted'
  | 'follow-up'
  | 'qualified'
  | 'won'
  | 'closed-lost';

export type InteractionType =
  | 'note'
  | 'call'
  | 'email'
  | 'sms'
  | 'follow-up'
  | 'stage-change'
  | 'ai-summary';

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'no-answer'
  | 'canceled';

export type MessageChannel = 'email' | 'sms';

export type MessageStatus =
  | 'queued'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'policy-blocked';

export interface FeatureFlags {
  emailEnabled: boolean;
  smsEnabled: boolean;
  smsCampaignApproved: boolean;
  webSoftphoneEnabled: boolean;
}

export interface CampaignApproval {
  id: string;
  approvedByUserId: string;
  approvedAt: string;
  approvalNote: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: CmsRole[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface Account {
  id: string;
  name: string;
  industry?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactMethod {
  id: string;
  contactId: string;
  type: 'email' | 'phone';
  value: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface ContactAvailability {
  id: string;
  contactId: string;
  dayOfWeek: number;
  startHour: string;
  endHour: string;
  timezone: string;
}

export interface Contact {
  id: string;
  accountId?: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  stageId: ContactStageId;
  phone?: string;
  email?: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  id: ContactStageId;
  label: string;
  sortOrder: number;
}

export interface ContactStageHistoryEntry {
  id: string;
  contactId: string;
  fromStageId: ContactStageId;
  toStageId: ContactStageId;
  changedByUserId: string;
  reason?: string;
  changedAt: string;
}

export interface Interaction {
  id: string;
  contactId: string;
  createdByUserId: string;
  type: InteractionType;
  body: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface FollowUp {
  id: string;
  contactId: string;
  dueAt: string;
  summary: string;
  assignedToUserId: string;
  completedAt?: string;
  createdAt: string;
}

export interface Task {
  id: string;
  contactId?: string;
  title: string;
  detail?: string;
  dueAt?: string;
  status: 'open' | 'completed';
  assignedToUserId: string;
  createdAt: string;
  completedAt?: string;
}

export interface Reminder {
  id: string;
  taskId: string;
  remindAt: string;
  sentAt?: string;
  createdAt: string;
}

export interface Call {
  id: string;
  contactId: string;
  initiatedByUserId: string;
  fromNumber: string;
  toNumber: string;
  provider: 'twilio' | 'telnyx' | 'mock';
  providerCallId?: string;
  status: CallStatus;
  startedAt?: string;
  endedAt?: string;
  recordingConsentPlayed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CallEvent {
  id: string;
  callId: string;
  providerEventId?: string;
  eventType: string;
  rawPayload: Record<string, unknown>;
  eventAt: string;
  createdAt: string;
}

export interface CallRecording {
  id: string;
  callId: string;
  providerRecordingId?: string;
  storageKey: string;
  sourceUrl: string;
  durationSeconds?: number;
  createdAt: string;
  purgedAt?: string;
}

export interface CallTranscript {
  id: string;
  callId: string;
  recordingId?: string;
  content: string;
  provider: 'mock' | 'openai' | 'other';
  createdAt: string;
  purgedAt?: string;
}

export interface AiActionItem {
  id: string;
  callId: string;
  description: string;
  ownerUserId: string;
  dueAt?: string;
  confidence: number;
  createdAt: string;
}

export interface AiFollowUpSuggestion {
  id: string;
  callId: string;
  dueAt?: string;
  summary: string;
  confidence: number;
  createdAt: string;
}

export interface AiSummary {
  id: string;
  callId: string;
  summary: string;
  keyPoints: string[];
  confidence: number;
  status: 'proposed' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt?: string;
  approvedByUserId?: string;
}

export interface OutboundMessage {
  id: string;
  channel: MessageChannel;
  status: MessageStatus;
  to: string;
  from: string;
  subject?: string;
  body: string;
  contactId?: string;
  createdByUserId: string;
  providerMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageEvent {
  id: string;
  messageId: string;
  status: MessageStatus;
  rawPayload?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
  detail?: Record<string, unknown>;
}

export interface WebhookEventDedupe {
  id: string;
  source: string;
  eventId: string;
  firstSeenAt: string;
}
