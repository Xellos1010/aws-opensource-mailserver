export type CmsJobType =
  | 'email.send'
  | 'call.transcribe'
  | 'call.extract'
  | 'retention.purge';

export interface CmsJobBase {
  id: string;
  type: CmsJobType;
  createdAt: string;
  attempts: number;
  availableAt: string;
}

export interface EmailSendJob extends CmsJobBase {
  type: 'email.send';
  payload: {
    messageId: string;
  };
}

export interface CallTranscribeJob extends CmsJobBase {
  type: 'call.transcribe';
  payload: {
    callId: string;
    recordingId: string;
    recordingUrl: string;
  };
}

export interface CallExtractJob extends CmsJobBase {
  type: 'call.extract';
  payload: {
    callId: string;
  };
}

export interface RetentionPurgeJob extends CmsJobBase {
  type: 'retention.purge';
  payload: {
    retentionDays: number;
  };
}

export type CmsJob =
  | EmailSendJob
  | CallTranscribeJob
  | CallExtractJob
  | RetentionPurgeJob;
