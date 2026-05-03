import { ContactStageId } from '@mm/cms-contracts';

const ALLOWED_TRANSITIONS: Record<ContactStageId, ContactStageId[]> = {
  new: ['contacted', 'closed-lost'],
  contacted: ['follow-up', 'qualified', 'closed-lost'],
  'follow-up': ['contacted', 'qualified', 'closed-lost'],
  qualified: ['won', 'closed-lost', 'follow-up'],
  won: ['follow-up'],
  'closed-lost': ['follow-up', 'contacted'],
};

export function isStageTransitionAllowed(
  from: ContactStageId,
  to: ContactStageId
): boolean {
  if (from === to) {
    return false;
  }
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function getAllowedTransitions(from: ContactStageId): ContactStageId[] {
  return [...ALLOWED_TRANSITIONS[from]];
}
