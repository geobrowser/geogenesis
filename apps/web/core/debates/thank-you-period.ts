import type { Debate } from './api';

type ThankYouPeriodDebate = Pick<Debate, 'status' | 'turn_ends_at' | 'completed_at'>;

/**
 * When a finished debate's thank-you period ends: `turn_ends_at` once the debate is thanking or
 * complete, `completed_at` when the period never ran. Null before the debate has ended, or when
 * geo-chat sent neither.
 *
 * geo-chat holds the same deadline for withdrawing the recording (`recording_cancellation_allowed`),
 * so the room's thank-you screen and the claim picker's publishing card both read it from here.
 */
export function debateThankYouDeadlineMs(debate: ThankYouPeriodDebate): number | null {
  if (debate.status !== 'thanking' && debate.status !== 'complete') return null;
  const deadline = Date.parse(debate.turn_ends_at ?? debate.completed_at ?? '');
  return Number.isFinite(deadline) ? deadline : null;
}

export function isDebateInThankYouPeriod(debate: ThankYouPeriodDebate, now: number) {
  const deadline = debateThankYouDeadlineMs(debate);
  return deadline !== null && now < deadline;
}
