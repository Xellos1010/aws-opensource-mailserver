import { CallRecording, CallTranscript } from '@mm/cms-contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getRetentionCutoff(now: Date, retentionDays = 90): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

export function shouldPurgeRawArtifact(
  createdAtIso: string,
  now: Date,
  retentionDays = 90
): boolean {
  return new Date(createdAtIso).getTime() < getRetentionCutoff(now, retentionDays).getTime();
}

export function calculatePurgeTargets(
  recordings: CallRecording[],
  transcripts: CallTranscript[],
  now: Date,
  retentionDays = 90
): {
  recordingIds: string[];
  transcriptIds: string[];
} {
  return {
    recordingIds: recordings
      .filter((item) => !item.purgedAt && shouldPurgeRawArtifact(item.createdAt, now, retentionDays))
      .map((item) => item.id),
    transcriptIds: transcripts
      .filter((item) => !item.purgedAt && shouldPurgeRawArtifact(item.createdAt, now, retentionDays))
      .map((item) => item.id),
  };
}
