export type CuratorOnboardingStepId =
  | 'join-space'
  | 'claim-position'
  | 'participate-debate'
  | 'debate-winner'
  | 'rsvp-community-call'
  | 'vote-entity'
  | 'submit-ranking'
  | 'comment-entity';

export type CuratorOnboardingStep = {
  id: CuratorOnboardingStepId;
  title: string;
  description: string;
  /**
   * Kept, but not shown, and not counted (GEO-2800).
   *
   * Hidden rather than deleted because we expect to want these back: the step keeps its entry here
   * and its completion check in `useCuratorOnboardingStatus`, so anyone who already finished one
   * still has that recorded and unhiding is a one-word edit rather than an archaeology exercise.
   * The cost of keeping them is one query each; the cost of deleting them is the tracking.
   */
  hidden?: true;
};

/**
 * The onboarding checklist, in the order it is shown.
 *
 * One list, rendered on both surfaces that show the card — the Explore page and the root overview
 * both mount `ExploreSidePanel` — so the checklist cannot differ between them.
 */
export const CURATOR_ONBOARDING_STEPS: CuratorOnboardingStep[] = [
  {
    id: 'join-space',
    title: 'Join a space',
    description: 'Spaces are communities of people organized around a shared interest',
  },
  {
    id: 'claim-position',
    title: 'Take a position on a claim',
    description: 'Indicate your stance on a claim',
  },
  {
    id: 'participate-debate',
    title: 'Participate in a debate',
    description: 'Record a debate with someone who holds an opposing view',
  },
  {
    id: 'debate-winner',
    title: 'Choose the winner of a debate',
    description: 'Watch a debate and choose a winner',
  },
  {
    id: 'vote-entity',
    title: 'Vote on an entity',
    description: 'Express your view on an entity using an upvote or downvote',
  },
  {
    id: 'comment-entity',
    title: 'Comment on an entity',
    description: 'Join the conversation by leaving a comment on an entity of interest',
  },
  {
    id: 'rsvp-community-call',
    title: 'RSVP for a community call',
    description: 'Community calls are a great way to find out how to get involved',
    hidden: true,
  },
  {
    id: 'submit-ranking',
    title: 'Submit a ranking',
    description: 'Rank top content to impact what people see',
    hidden: true,
  },
];

/**
 * What the card renders and what progress is measured against.
 *
 * Both, deliberately from one filter. A reader has to be able to reach 100% on what they can see,
 * so a hidden step counted in the total would leave the bar stuck short of full with nothing on
 * screen to explain it.
 */
export const VISIBLE_CURATOR_ONBOARDING_STEPS = CURATOR_ONBOARDING_STEPS.filter(step => !step.hidden);

export const CURATOR_ONBOARDING_PROGRESS_COLOR = '#6833FF';
