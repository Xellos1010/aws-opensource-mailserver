import {
  NormalizedCallEvent,
  OutboundCallInput,
  ProviderCallRef,
  ProviderWebhookEvent,
  RecordingArtifact,
  TelephonyProvider,
} from '@mm/cms-contracts';

export class MockTwilioTelephonyProvider implements TelephonyProvider {
  async createOutboundCall(input: OutboundCallInput): Promise<ProviderCallRef> {
    return {
      provider: 'twilio',
      providerCallId: `TWILIO_${input.callId}_${Date.now()}`,
      dialUrl: `https://example.invalid/twilio/${input.callId}`,
    };
  }

  async handleWebhook(event: ProviderWebhookEvent): Promise<NormalizedCallEvent[]> {
    const payload = event.payload;
    const providerCallId = String(
      payload.CallSid ?? payload.providerCallId ?? payload.callSid ?? payload.call_id ?? ''
    );
    if (!providerCallId) {
      return [];
    }

    const eventType = String(payload.EventType ?? payload.CallStatus ?? payload.eventType ?? 'event');
    const createdAt = String(payload.Timestamp ?? payload.timestamp ?? new Date().toISOString());
    const mappedStatus = mapTwilioStatus(eventType);

    const recordingUrl = payload.RecordingUrl ? String(payload.RecordingUrl) : undefined;
    const recordingSid = payload.RecordingSid ? String(payload.RecordingSid) : undefined;

    const normalized: NormalizedCallEvent = {
      providerCallId,
      eventId: event.eventId,
      eventType,
      eventAt: createdAt,
      payload,
      mappedStatus,
      recordingArtifact:
        recordingUrl || recordingSid
          ? {
              sourceUrl: recordingUrl ?? 'mock://recording',
              storageKey: `recordings/${providerCallId}/${recordingSid ?? Date.now()}.mp3`,
              providerRecordingId: recordingSid,
            }
          : undefined,
    };

    return [normalized];
  }

  async fetchRecording(callProviderId: string): Promise<RecordingArtifact> {
    return {
      sourceUrl: `mock://recordings/${callProviderId}.mp3`,
      storageKey: `recordings/${callProviderId}.mp3`,
      providerRecordingId: `${callProviderId}_recording`,
    };
  }
}

function mapTwilioStatus(eventType: string): NormalizedCallEvent['mappedStatus'] {
  const normalized = eventType.toLowerCase();
  if (normalized.includes('ring')) {
    return 'ringing';
  }
  if (normalized.includes('in-progress') || normalized.includes('answered')) {
    return 'in-progress';
  }
  if (normalized.includes('completed')) {
    return 'completed';
  }
  if (normalized.includes('busy') || normalized.includes('failed')) {
    return 'failed';
  }
  if (normalized.includes('no-answer')) {
    return 'no-answer';
  }
  if (normalized.includes('canceled') || normalized.includes('cancelled')) {
    return 'canceled';
  }
  if (normalized.includes('queued') || normalized.includes('initiated')) {
    return 'initiated';
  }
  return undefined;
}
