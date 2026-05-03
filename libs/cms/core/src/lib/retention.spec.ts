import { calculatePurgeTargets, getRetentionCutoff, shouldPurgeRawArtifact } from './retention';

describe('retention', () => {
  const now = new Date('2026-02-14T00:00:00.000Z');

  it('calculates cutoff', () => {
    expect(getRetentionCutoff(now, 90).toISOString()).toBe('2025-11-16T00:00:00.000Z');
  });

  it('marks old artifacts for purge', () => {
    expect(shouldPurgeRawArtifact('2025-11-01T00:00:00.000Z', now, 90)).toBe(true);
    expect(shouldPurgeRawArtifact('2025-12-01T00:00:00.000Z', now, 90)).toBe(false);
  });

  it('returns purge target ids', () => {
    const targets = calculatePurgeTargets(
      [
        {
          id: 'rec_old',
          callId: 'cal_1',
          sourceUrl: 'x',
          storageKey: 'x',
          createdAt: '2025-11-01T00:00:00.000Z',
        },
        {
          id: 'rec_new',
          callId: 'cal_1',
          sourceUrl: 'x',
          storageKey: 'x',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      [
        {
          id: 'tr_old',
          callId: 'cal_1',
          content: 'old',
          provider: 'mock',
          createdAt: '2025-11-01T00:00:00.000Z',
        },
      ],
      now,
      90
    );

    expect(targets.recordingIds).toEqual(['rec_old']);
    expect(targets.transcriptIds).toEqual(['tr_old']);
  });
});
