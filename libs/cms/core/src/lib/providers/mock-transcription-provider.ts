import {
  TranscriptResult,
  TranscriptionInput,
  TranscriptionProvider,
} from '@mm/cms-contracts';

export class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: TranscriptionInput): Promise<TranscriptResult> {
    return {
      provider: 'mock',
      confidence: 0.91,
      content: `Call ${input.callId} transcript from ${input.recordingUrl}. Discussed outreach cadence, requested follow-up package, and next meeting in 48 hours.`,
    };
  }
}
