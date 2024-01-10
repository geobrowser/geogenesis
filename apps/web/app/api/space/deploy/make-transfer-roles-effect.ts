import { SpaceArtifact } from '@geogenesis/contracts';
import { Effect, Schedule } from 'effect';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';

import { slog } from '~/core/utils/utils';

import { GrantRoleError, RenounceRoleError } from '../../errors';
import { ROLES, Role } from '../../roles';

interface TransferRoleConfig {
  spaceAddress: string;
  userAccount: `0x${string}`;
}

export function makeTransferRolesEffect(requestId: string, { spaceAddress, userAccount }: TransferRoleConfig) {
  const account = privateKeyToAccount(process.env.GEO_PK as `0x${string}`);

  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL, { batch: true }),
    // transport: http(Environment.options.testnet.rpc, { batch: true }),
  });

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL, { batch: true }),
    // transport: http(Environment.options.testnet.rpc, { batch: true }),
  });

  // Grant each role to the new user
  const createGrantRoleEffect = (role: Role) => {
    return Effect.tryPromise({
      try: async () => {
        const simulateGrantRoleResult = await publicClient.simulateContract({
          abi: SpaceArtifact.abi,
          address: spaceAddress as `0x${string}`,
          functionName: 'grantRole',
          account,
          args: [role.binary, userAccount],
        });

        const grantRoleSimulateHash = await client.writeContract(simulateGrantRoleResult.request);
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
          abi: SpaceArtifact.abi,
          address: spaceAddress as `0x${string}`,
          functionName: 'renounceRole',
          account,
          args: [role.binary, account.address],
        });

        const grantRoleSimulateHash = await client.writeContract(simulateRenounceRoleResult.request);
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
