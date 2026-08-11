import { describe, expect, it } from 'vitest';

import { ACTION_REVERTED_SELECTOR, type GovernanceRevert } from './governance-errors';
import { classifyProposalExecutability } from './proposal-executability';

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
});
