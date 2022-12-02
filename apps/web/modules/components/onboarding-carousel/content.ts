export type OnboardingStep = 'collect' | 'organize' | 'empower' | 'solve';

export const ONBOARDING_CONTENT: Record<OnboardingStep, { title: string; description: string }> = {
  collect: {
    title: 'We are here',
    description: `Geo is built on the principle that data should be owned and created by its users in a decentralized and
    verifiable way. The first and most crucial step is to collect data for a wide range of spaces as
    triples, which can then be used to structure meaningful content.`,
  },
  organize: {
    title: 'Organize the world’s data',
    description: `Once we’ve captured and imported enough information from quality sources, we can start organizing that data. Link related facts, attach evidence to claims, show which claims support each other and which are in conflict. By organizing information we can better understand and talk about complex issues.`,
  },
  empower: {
    title: 'Empower our communities',
    description: `People want to get their ideas out there and they want to make a difference. Once communities get their public policy positions captured in Geo with supporting evidence, we can amplify their voices, help direct funding towards their cause, put their positions in front of policy makers, and organize to drive change.`,
  },
  solve: {
    title: 'Solve the world’s biggest challenges',
    description: `Every generation has to decide for themselves the legacy they want to leave behind. We’ve inherited a ton of problems, but none of them are unsolvable if we put our minds to it! Laws can be changed, protocols with new incentive systems can be created. From homelessness, to abundant housing, to public safety, and climate change, we can get organized and leave things better than we found it.`,
  },
};
