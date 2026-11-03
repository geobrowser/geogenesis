import { describe, expect, it, vi } from 'vitest';

import { readScheduleOutcome } from './schedule-outcome';

const dao = { type: 'DAO', address: '0xabc' };
const proposalId = 'a'.repeat(32);

describe('readScheduleOutcome', () => {
  it('reads execution of the proposal it was given', async () => {
    const readExecuted = vi.fn().mockResolvedValue(true);
    await expect(
      readScheduleOutcome({ spaceId: 's', proposalId, readSpace: async () => dao, readExecuted })
    ).resolves.toBe('executed');
    expect(readExecuted).toHaveBeenCalledWith({ daoSpaceAddress: '0xabc', proposalId: `0x${proposalId}` });
  });

  it('is pending when the auto-execute did not land', async () => {
    await expect(
      readScheduleOutcome({ spaceId: 's', proposalId, readSpace: async () => dao, readExecuted: async () => false })
    ).resolves.toBe('pending');
  });

  it('is unknown when the chain or the space cannot be read', async () => {
    await expect(
      readScheduleOutcome({ spaceId: 's', proposalId, readSpace: async () => dao, readExecuted: async () => null })
    ).resolves.toBe('unknown');
    await expect(
      readScheduleOutcome({
        spaceId: 's',
        proposalId,
        readSpace: () => Promise.reject(new Error('down')),
        readExecuted: async () => true,
      })
    ).resolves.toBe('unknown');
  });

  it('treats a personal space as executed', async () => {
    const readExecuted = vi.fn();
    await expect(
      readScheduleOutcome({
        spaceId: 's',
        proposalId,
        readSpace: async () => ({ type: 'PERSONAL', address: '0x1' }),
        readExecuted,
      })
    ).resolves.toBe('executed');
    expect(readExecuted).not.toHaveBeenCalled();
  });
});
