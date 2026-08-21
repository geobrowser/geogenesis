import { describe, expect, it } from 'vitest';

import * as Ontology from './ontology';

/**
 * Pins every ontology id to the hex value that lives on-chain (verified against
 * testnet data and curator-app's `packages/curator-utils/src/ids.ts`). The
 * module re-exports from geo-sdk, so this suite is the tripwire that catches a
 * geo-sdk bump silently renaming or repointing one of them — a drift here
 * corrupts cross-app interop, not just this app.
 */
const ONCHAIN_IDS = {
  BOUNTY_TYPE_ID: '808af0bad5884e3391f09dd4b25e18be',
  BOUNTY_DESCRIPTION_PROPERTY_ID: '9b1f76ff9711404c861e59dc3fa7d037',
  BOUNTY_BUDGET_PROPERTY_ID: '9ece325c592d42d5b2e785e8e6fe05b6',
  BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID: '1d7bb89ec2854df7afac28cec9007e38',
  BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID: '21c06b6d7f7846f1ac65e4fc4eadc615',
  BOUNTY_DEADLINE_PROPERTY_ID: '7566286ca054405a83e185ffd60492fb',
  BOUNTY_SKILLS_PROPERTY_ID: 'a38732e33a3d47f9a459fb369c287709',
  BOUNTY_CREATOR_PROPERTY_ID: 'e200041dba1a4ca7b28497fe22d8e234',
  BOUNTY_MAINTAINER_PROPERTY_ID: '0693e377eafd42278487cd143250357f',
  BOUNTY_DIFFICULTY_PROPERTY_ID: '8c8405abc6bc4d46a5806e4fc80d8187',
  DIFFICULTY_TYPE_ID: '0ef12e0df2e4478c96cdfd3901109b16',
  EASY_DIFFICULTY_ID: '6ce89cfc43e14e44a5cb4da93ed7d453',
  MEDIUM_DIFFICULTY_ID: '74a88abeaf694d4d969eef651c61f58a',
  HARD_DIFFICULTY_ID: '80daec57cf454643a73c632e5dcb6834',
  BOUNTY_TASK_STATUS_PROPERTY_ID: '054a7993ec2843e29688c84ac7a09220',
  BOUNTY_TASK_STATUS_TYPE_ID: 'b69f2e11ec7b4ab4a5024947aca078bb',
  BOUNTY_STATUS_BACKLOG_ID: 'ee3dd49a49754ff696d0af79044dc21c',
  BOUNTY_STATUS_TODO_ID: '76b5b831a5fa4203ad61b3f93915edec',
  BOUNTY_STATUS_IN_PROGRESS_ID: '548fca08e94743668457b0d8429d5bf9',
  BOUNTY_STATUS_IN_REVIEW_ID: '16f543624376498ea00d5aad45096a45',
  BOUNTY_STATUS_DONE_ID: '425f3e809cf9488696581775159dfc33',
  BOUNTY_STATUS_CANCELLED_ID: '0fb6253b9f2c405886bc49f170f317b3',
  INTERESTED_IN_BOUNTY_PROPERTY_ID: 'ff7e1b4444a2419187324e6c222afe07',
  BOUNTY_ALLOCATED_PROPERTY_ID: 'cfeb642223c54df4b3f9375a489d9e22',
  BOUNTY_SUBMISSION_PROPERTY_ID: '3b4c516ff3ac41e0a939374119a27d6e',
  PAYOUT_TYPE_ID: 'f5132deb102d64553049f1e9cb662f50',
  PAYOUT_AMOUNT_PROPERTY_ID: '82fe45a31df74c0291afa6e68d41cddf',
  PAYOUT_RECIPIENT_PROPERTY_ID: 'fddacaae85138a43ec1a50ff71564d42',
  PAYOUT_BOUNTY_PROPERTY_ID: '1b595a8b81fc25856a9b503e3e993331',
  PAYOUT_PROPOSALS_PROPERTY_ID: '8128964c1ec54829beb380a21ab64c51',
  REVIEW_PROPOSALS_PROPERTY_ID: '8128964c1ec54829beb380a21ab64c51',
  BOUNTY_REVIEW_TYPE_ID: '36efe3dcd94046e6a4276a3827d72f85',
  REVIEW_PASS_PROPERTY_ID: '88cb2cbe3a6a4949bea9606e93686877',
  REVIEW_COMMENT_PROPERTY_ID: 'e3e363d1dd294ccb8e6ff3b76d99bc33',
  REVIEW_COMPLETENESS_RATING_PROPERTY_ID: 'a6183aada4324c91aed229221306543e',
  REVIEW_ACCURACY_RATING_PROPERTY_ID: '6858ea8c5f1d4fa3a8de1034607d0460',
  REVIEW_SKILL_RATING_PROPERTY_ID: '0db7b66387a54044a752e9bf4517304a',
  REVIEW_EFFORT_RATING_PROPERTY_ID: '3c83be2afadf449c94259ff6ce0dd10e',
} as const;

describe('bounty ontology', () => {
  it.each(Object.entries(ONCHAIN_IDS))('%s matches its on-chain id', (name, hex) => {
    expect(Ontology[name as keyof typeof Ontology]).toBe(hex);
  });

  it('exports no ids beyond the pinned set', () => {
    expect(Object.keys(Ontology).sort()).toEqual(Object.keys(ONCHAIN_IDS).sort());
  });

  it('keeps the payout and review Proposals property the same id (readers disambiguate by type)', () => {
    expect(Ontology.PAYOUT_PROPOSALS_PROPERTY_ID).toBe(Ontology.REVIEW_PROPOSALS_PROPERTY_ID);
  });
});
