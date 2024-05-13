import { LegacySpaceAbi } from '@geogenesis/sdk/legacy';
import { Effect, Schedule } from 'effect';

import { slog } from '~/core/utils/utils';

import { geoAccount, publicClient, walletClient } from '../../client';
import { GrantRoleError, RenounceRoleError } from '../../errors';
import { ROLES, Role } from '../../roles';

interface TransferRoleConfig {
  spaceAddress: string;
  userAccount: `0x${string}`;
}

export function makeTransferRolesEffect(requestId: string, { spaceAddress, userAccount }: TransferRoleConfig) {
  // Grant each role to the new user
  const createGrantRoleEffect = (role: Role) => {
    return Effect.tryPromise({
      try: async () => {
        const simulateGrantRoleResult = await publicClient.simulateContract({
          abi: LegacySpaceAbi,
          address: spaceAddress as `0x${string}`,
          functionName: 'grantRole',
          account: geoAccount,
          args: [role.binary as `0x${string}`, userAccount],
        });

        const grantRoleSimulateHash = await walletClient.writeContract(simulateGrantRoleResult.request);
        slog({
          requestId,
          message: `Grant ${role.role} role hash: ${grantRoleSimulateHash}`,
          account: userAccount,
        });

        const grantRoleTxHash = await publicClient.waitForTransactionReceipt({
          hash: grantRoleSimulateHash,
        });
        slog({
          requestId,
          message: `Granted ${role.role} role for ${spaceAddress}: ${grantRoleTxHash.transactionHash}`,
          account: userAccount,
        });

        return grantRoleSimulateHash;
      },
      catch: error => {
        slog({
          level: 'error',
          requestId,
          message: `Granting ${role.role} role failed: ${(error as Error).message}`,
          account: userAccount,
        });
        return new GrantRoleError();
      },
    });
  };

  // Renounce each role from the deployer
  const createRenounceRoleEffect = (role: Role) => {
    return Effect.tryPromise({
      try: async () => {
        const simulateRenounceRoleResult = await publicClient.simulateContract({
          abi: LegacySpaceAbi,
          address: spaceAddress as `0x${string}`,
          functionName: 'renounceRole',
          account: geoAccount,
          args: [role.binary as `0x${string}`, geoAccount.address],
        });

        const grantRoleSimulateHash = await walletClient.writeContract(simulateRenounceRoleResult.request);
        slog({
          requestId,
          message: `Renounce ${role.role} role hash: ${grantRoleSimulateHash}`,
          account: userAccount,
        });

        const renounceRoleTxResult = await publicClient.waitForTransactionReceipt({
          hash: grantRoleSimulateHash,
        });
        slog({
          requestId,
          message: `Renounced ${role.role} role for Geo deployer ${spaceAddress}: ${renounceRoleTxResult.transactionHash}`,
          account: userAccount,
        });

        return renounceRoleTxResult;
      },
      catch: error => {
        slog({
          level: 'error',
          requestId,
          message: `Renouncing ${role.role} role failed: ${(error as Error).message}`,
          account: userAccount,
        });
        return new RenounceRoleError();
      },
    });
  };

  return Effect.gen(function* (unwrap) {
    // @TODO: Batch?
    // Configure roles in proxy contract
    for (const role of ROLES) {
      const grantRoleEffect = createGrantRoleEffect(role);
      yield* unwrap(Effect.retry(grantRoleEffect, Schedule.exponential('1 seconds')));
    }

    // @TODO Batch?
    // Renounce deployer roles in proxy contract
    for (const role of ROLES) {
      const renounceRoleEffect = createRenounceRoleEffect(role);
      yield* unwrap(Effect.retry(renounceRoleEffect, Schedule.exponential('1 seconds')));
    }
  });
}
