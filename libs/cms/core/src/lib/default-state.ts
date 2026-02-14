import { ContactStageId, Stage } from '@mm/cms-contracts';
import { hashPassword } from './auth';
import { DEFAULT_FEATURE_FLAGS } from './policy';
import { CmsState, UserRecord } from './state';

const DEFAULT_STAGES: Stage[] = [
  { id: 'new', label: 'New', sortOrder: 10 },
  { id: 'contacted', label: 'Contacted', sortOrder: 20 },
  { id: 'follow-up', label: 'Follow-up', sortOrder: 30 },
  { id: 'qualified', label: 'Qualified', sortOrder: 40 },
  { id: 'won', label: 'Won', sortOrder: 50 },
  { id: 'closed-lost', label: 'Closed Lost', sortOrder: 60 },
];

export interface InitialUserConfig {
  ownerEmail?: string;
  ownerName?: string;
  ownerPassword?: string;
  passwordSalt: string;
}

export function createDefaultOwner(config: InitialUserConfig, nowIso: string): UserRecord {
  return {
    id: 'usr_1',
    email: config.ownerEmail ?? 'owner@emcnotary.com',
    displayName: config.ownerName ?? 'Owner User',
    roles: ['owner', 'manager'],
    createdAt: nowIso,
    updatedAt: nowIso,
    passwordHash: hashPassword(config.ownerPassword ?? 'ChangeMe123!', config.passwordSalt),
  };
}

export function createDefaultState(config: InitialUserConfig): CmsState {
  const nowIso = new Date().toISOString();
  const owner = createDefaultOwner(config, nowIso);
  return {
    meta: {
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    users: [owner],
    refreshTokens: [],
    accounts: [
      {
        id: 'acc_1',
        name: 'Example Title Agency',
        industry: 'Title Services',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ],
    contacts: [
      {
        id: 'con_1',
        accountId: 'acc_1',
        firstName: 'Jordan',
        lastName: 'Smith',
        jobTitle: 'Escrow Officer',
        stageId: 'new',
        email: 'jordan.smith@example.com',
        phone: '+15555550100',
        ownerUserId: owner.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ],
    contactMethods: [],
    contactAvailability: [],
    stages: DEFAULT_STAGES,
    stageHistory: [],
    interactions: [],
    followUps: [],
    tasks: [],
    reminders: [],
    calls: [],
    callEvents: [],
    callRecordings: [],
    callTranscripts: [],
    aiSummaries: [],
    aiActionItems: [],
    aiFollowUps: [],
    messages: [],
    messageEvents: [],
    featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    campaignApprovals: [],
    auditLogs: [],
    webhookEventDedupe: [],
    jobs: [],
    counters: {
      user: 1,
      account: 1,
      contact: 1,
      interaction: 0,
      followup: 0,
      call: 0,
      callevent: 0,
      recording: 0,
      transcript: 0,
      message: 0,
      messageevent: 0,
      aisummary: 0,
      aiaction: 0,
      aifollowup: 0,
      task: 0,
      reminder: 0,
      stagehistory: 0,
      webhookdedupe: 0,
      refresh: 0,
      approval: 0,
      audit: 0,
      job: 0,
    },
  };
}

export function stageIdOrThrow(candidate: string): ContactStageId {
  if (
    candidate !== 'new' &&
    candidate !== 'contacted' &&
    candidate !== 'follow-up' &&
    candidate !== 'qualified' &&
    candidate !== 'won' &&
    candidate !== 'closed-lost'
  ) {
    throw new Error(`Invalid stage id: ${candidate}`);
  }
  return candidate;
}
