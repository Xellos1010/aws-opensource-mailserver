export interface OutboundCallInput {
  fromNumber: string;
  toNumber: string;
  callerName?: string;
  callId: string;
  recordCall: boolean;
  consentPrompt: string;
}

export interface ProviderCallRef {
  providerCallId: string;
  provider: 'twilio' | 'telnyx' | 'mock';
  dialUrl?: string;
}

export interface ProviderWebhookEvent {
  source: 'twilio' | 'telnyx' | 'mock';
  eventId: string;
  payload: Record<string, unknown>;
}

export interface RecordingArtifact {
  sourceUrl: string;
  storageKey: string;
  providerRecordingId?: string;
  durationSeconds?: number;
}

export interface NormalizedCallEvent {
  providerCallId: string;
  eventId: string;
  eventType: string;
  eventAt: string;
  payload: Record<string, unknown>;
  recordingArtifact?: RecordingArtifact;
  mappedStatus?:
    | 'initiated'
    | 'ringing'
    | 'in-progress'
    | 'completed'
    | 'failed'
    | 'no-answer'
    | 'canceled';
}

export interface TelephonyProvider {
  createOutboundCall(input: OutboundCallInput): Promise<ProviderCallRef>;
  handleWebhook(event: ProviderWebhookEvent): Promise<NormalizedCallEvent[]>;
  fetchRecording(callProviderId: string): Promise<RecordingArtifact>;
}

export interface TranscriptionInput {
  callId: string;
  recordingUrl: string;
  languageHint?: string;
}

export interface TranscriptResult {
  provider: 'mock' | 'openai' | 'other';
  content: string;
  confidence?: number;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptResult>;
}

export interface ExtractInput {
  callId: string;
  transcript: string;
  contactContext?: string;
}

export interface StructuredCallSummary {
  summary: string;
  keyPoints: string[];
  actionItems: Array<{
    description: string;
    dueAt?: string;
    confidence: number;
  }>;
  followUps: Array<{
    summary: string;
    dueAt?: string;
    confidence: number;
  }>;
  confidence: number;
}

export interface ExtractionProvider {
  extract(input: ExtractInput): Promise<StructuredCallSummary>;
}
