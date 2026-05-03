import { getAllowedTransitions, isStageTransitionAllowed } from './stage-rules';

describe('stage-rules', () => {
  it('allows valid transition', () => {
    expect(isStageTransitionAllowed('new', 'contacted')).toBe(true);
  });

  it('rejects invalid transition', () => {
    expect(isStageTransitionAllowed('new', 'won')).toBe(false);
  });

  it('lists allowed transitions', () => {
    expect(getAllowedTransitions('qualified')).toEqual(['won', 'closed-lost', 'follow-up']);
  });
});
