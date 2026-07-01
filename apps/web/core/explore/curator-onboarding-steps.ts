export type CuratorOnboardingStepId =
  | 'join-space'
  | 'rsvp-community-call'
  | 'vote-entity'
  | 'submit-ranking'
  | 'comment-entity';

export type CuratorOnboardingStep = {
  id: CuratorOnboardingStepId;
  title: string;
  description: string;
  points: number;
};

export const CURATOR_ONBOARDING_STEPS: CuratorOnboardingStep[] = [
  {
    id: 'join-space',
    title: 'Join a space',
    description: 'Spaces are communities of people organized around a shared interest',
    points: 10,
  },
  {
    id: 'rsvp-community-call',
    title: 'RSVP for a community call',
    description: 'Community calls are a great way find out how to get involved',
    points: 10,
  },
  {
    id: 'vote-entity',
    title: 'Vote on an entity',
    description: 'Express your view on an entity using an upvote or downvote',
    points: 10,
  },
  {
    id: 'submit-ranking',
    title: 'Submit a ranking',
    description: 'Rank top content to impact what people see',
    points: 10,
  },
  {
    id: 'comment-entity',
    title: 'Comment on an entity',
    description: 'Join the conversation by leaving a comment on an entity of interest',
    points: 10,
  },
];

export const CURATOR_ONBOARDING_GEO_ICON_SRC = '/browse-nav/geo-curators.svg';

export const CURATOR_ONBOARDING_PROGRESS_COLOR = '#6833FF';
