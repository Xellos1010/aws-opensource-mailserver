import {
  ExtractInput,
  ExtractionProvider,
  StructuredCallSummary,
} from '@mm/cms-contracts';

export class MockExtractionProvider implements ExtractionProvider {
  async extract(input: ExtractInput): Promise<StructuredCallSummary> {
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    return {
      summary: `AI summary for call ${input.callId}: Contact requested follow-up documents and reconnection later this week.`,
      keyPoints: [
        'Contact acknowledged service interest.',
        'Requested additional package details.',
        'Preferred a follow-up call within 48 hours.',
      ],
      confidence: 0.88,
      actionItems: [
        {
          description: 'Send service package by email.',
          dueAt,
          confidence: 0.91,
        },
      ],
      followUps: [
        {
          summary: 'Schedule follow-up call for requested review.',
          dueAt,
          confidence: 0.86,
        },
      ],
    };
  }
}
