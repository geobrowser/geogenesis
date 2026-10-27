import { describe, expect, it } from 'vitest';

import {
  ACTION_REVERTED_SELECTOR,
  type GovernanceRevert,
  INVALID_SPACE_ID_FOR_ROLE_SELECTOR,
  decodeGovernanceRevert,
} from './governance-errors';
import {
  classifyProposalExecutability,
  describeDeadProposal,
  isPermanentExecuteRevert,
} from './proposal-executability';

const CAN_NOT_EXECUTE_SELECTOR = '0xdf322356';

function revert(selector: string): GovernanceRevert {
  return { selector } as GovernanceRevert;
}

describe('classifyProposalExecutability', () => {
  it('is checking until a simulation has run', () => {
    expect(classifyProposalExecutability({ existsOnChain: true, simulationRevert: undefined })).toBe('checking');
    expect(classifyProposalExecutability({ existsOnChain: null, simulationRevert: undefined })).toBe('checking');
  });

  it('is executable when the simulation does not revert', () => {
    expect(classifyProposalExecutability({ existsOnChain: true, simulationRevert: null })).toBe('executable');
  });

  it('fails open when the failure is unrecognisable, so a flaky RPC never hides a live action', () => {
    expect(classifyProposalExecutability({ existsOnChain: null, simulationRevert: null })).toBe('executable');
  });

  it('is dead when the proposal action itself reverts', () => {
    expect(
      classifyProposalExecutability({ existsOnChain: true, simulationRevert: revert(ACTION_REVERTED_SELECTOR) })
    ).toBe('dead');
  });

  it('is blocked for a transient governance revert', () => {
    expect(
      classifyProposalExecutability({ existsOnChain: true, simulationRevert: revert(CAN_NOT_EXECUTE_SELECTOR) })
    ).toBe('blocked');
  });

  // The regression this module exists for: a migrated proposal the DAO has no
  // record of reverts CanNotExecute(), which is otherwise classified `blocked` —
  // i.e. transient — so the UI showed "Pending execution" forever. Absence has to
  // win over the revert selector.
  it('is dead when the DAO has no record of the proposal, even though it reverts CanNotExecute', () => {
    expect(
      classifyProposalExecutability({ existsOnChain: false, simulationRevert: revert(CAN_NOT_EXECUTE_SELECTOR) })
    ).toBe('dead');
  });

  it('is dead when absent from the DAO before any simulation runs, so signed-out viewers see the truth', () => {
    expect(classifyProposalExecutability({ existsOnChain: false, simulationRevert: undefined })).toBe('dead');
  });

  it('does not treat an undeterminable existence probe as absence', () => {
    // `null` means "could not tell" — branding a healthy proposal dead off a
    // failed probe is worse than briefly showing the optimistic state.
    expect(
      classifyProposalExecutability({ existsOnChain: null, simulationRevert: revert(CAN_NOT_EXECUTE_SELECTOR) })
    ).toBe('blocked');
  });

  // GEO-2609: a proposal to remove an editor the DAO never actually granted (a
  // phantom role left by the migration replay) reverts InvalidSpaceIdForRole on
  // every execute. As `blocked` it refreshed back to "Pending execution" and
  // offered Execute again forever; it has to read as permanent.
  it('is dead when the role change contradicts the on-chain roles', () => {
    expect(
      classifyProposalExecutability({
        existsOnChain: true,
        simulationRevert: revert(INVALID_SPACE_ID_FOR_ROLE_SELECTOR),
      })
    ).toBe('dead');
  });

  it('classifies the real InvalidSpaceIdForRole error from the ticket as dead', () => {
    // The exact message the smart-account execute surfaced on 2026-08-20.
    const error = new Error('Execute failed', {
      cause: new Error(
        'InvalidSpaceIdForRole: The target space id is not valid for this membership role. (0x48b38022)'
      ),
    });
    const decoded = decodeGovernanceRevert(error);
    expect(decoded?.name).toBe('InvalidSpaceIdForRole');
    expect(classifyProposalExecutability({ existsOnChain: true, simulationRevert: decoded })).toBe('dead');
  });
});

describe('isPermanentExecuteRevert', () => {
  it('is true only for reverts no vote or wait can clear', () => {
    expect(isPermanentExecuteRevert(revert(ACTION_REVERTED_SELECTOR))).toBe(true);
    expect(isPermanentExecuteRevert(revert(INVALID_SPACE_ID_FOR_ROLE_SELECTOR))).toBe(true);
    expect(isPermanentExecuteRevert(revert(CAN_NOT_EXECUTE_SELECTOR))).toBe(false);
    expect(isPermanentExecuteRevert(null)).toBe(false);
  });
});

describe('describeDeadProposal', () => {
  it('names the role mismatch, and does not tell anyone to re-propose it', () => {
    const reason = describeDeadProposal(revert(INVALID_SPACE_ID_FOR_ROLE_SELECTOR));
    expect(reason).toContain("doesn't match the space's on-chain roles");
    expect(reason).toContain('Nothing needs to be re-proposed');
  });

  it('tells a broken legacy request to be recreated', () => {
    expect(describeDeadProposal(revert(ACTION_REVERTED_SELECTOR))).toContain('need to be recreated');
  });

  it('explains a proposal the DAO has no record of', () => {
    expect(describeDeadProposal(null)).toContain('no record of it on-chain');
  });
});
