import { getOwnableValidator, getSmartSessionsValidator, RHINESTONE_ATTESTER_ADDRESS } from '@rhinestone/module-sdk';
import { createSmartAccountClient, type SmartAccountClient } from 'permissionless';
import {
  type SafeSmartAccountImplementation,
  type ToSafeSmartAccountParameters,
  toSafeSmartAccount,
} from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import {
  type Address,
  type Chain,
  createPublicClient,
  type Hex,
  type HttpTransport,
  http,
  type WalletClient,
} from 'viem';
import { entryPoint07Address, type SmartAccountImplementation } from 'viem/account-abstraction';

// ERC-7579 module addresses — must match the Curator app's constants
const SAFE_7579_MODULE_ADDRESS: Hex = '0x7579EE8307284F293B1927136486880611F20002';
const ERC7579_LAUNCHPAD_ADDRESS: Hex = '0x7579011aB74c46090561ea277Ba79D510c6C00ff';

type SafeSmartAccount = SafeSmartAccountImplementation<'0.7'> & {
  address: Address;
  getNonce: NonNullable<SmartAccountImplementation['getNonce']>;
  isDeployed: () => Promise<boolean>;
  type: 'smart';
};

type GeoSmartAccount = SmartAccountClient<
  HttpTransport<undefined, false>,
  Chain,
  object &
    SafeSmartAccount & {
      address: Address;
      getNonce: NonNullable<SmartAccountImplementation['getNonce']>;
      isDeployed: () => Promise<boolean>;
      type: 'smart';
    },
  undefined,
  undefined
>;

type GenerateSmartAccountParams = {
  rpcUrl: string;
  bundlerUrl: string;
  chain: Chain;
  walletClient: WalletClient;
};

export async function generateSmartAccount({
  rpcUrl,
  bundlerUrl,
  chain,
  walletClient,
}: GenerateSmartAccountParams): Promise<GeoSmartAccount> {
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({
    transport,
    chain,
  });

  let safeAccount;

  if (chain.id === 19411) {
    // Testnet: always use legacy path (7579 modules not deployed on testnet)
    const safeAccountParams: ToSafeSmartAccountParameters<'0.7', undefined> = {
      client: publicClient,
      owners: [walletClient],
      entryPoint: {
        address: entryPoint07Address,
        version: '0.7',
      },
      version: '1.4.1',
      // Custom SAFE Addresses for testnet
      safeModuleSetupAddress: '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47',
      safe4337ModuleAddress: '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226',
      safeProxyFactoryAddress: '0xd9d2Ba03a7754250FDD71333F444636471CACBC4',
      safeSingletonAddress: '0x639245e8476E03e789a244f279b5843b9633b2E7',
      multiSendAddress: '0x7B21BBDBdE8D01Df591fdc2dc0bE9956Dde1e16C',
      multiSendCallOnlyAddress: '0x32228dDEA8b9A2bd7f2d71A958fF241D79ca5eEC',
    };

    safeAccount = await toSafeSmartAccount(safeAccountParams);
  } else {
    // Mainnet: match the Curator's two-path logic.
    // Try legacy first — if the account was deployed before 7579 migration, use that address.
    // Otherwise use the 7579 path, which is what the Curator uses for new accounts.
    const legacyParams: ToSafeSmartAccountParameters<'0.7', undefined> = {
      client: publicClient,
      owners: [walletClient],
      entryPoint: {
        address: entryPoint07Address,
        version: '0.7',
      },
      version: '1.4.1',
    };

    const legacyAccount = await toSafeSmartAccount(legacyParams);

    if (await legacyAccount.isDeployed()) {
      safeAccount = legacyAccount;
    } else {
      // New account — use 7579 path matching the Curator
      const ownerAddress = walletClient.account?.address;
      if (!ownerAddress) {
        throw new Error('Wallet client has no account address');
      }

      const ownableValidator = getOwnableValidator({
        owners: [ownerAddress],
        threshold: 1,
      });
      const smartSessionsValidator = getSmartSessionsValidator({});

      const erc7579Params: ToSafeSmartAccountParameters<'0.7', Hex> = {
        client: publicClient,
        owners: [walletClient],
        version: '1.4.1',
        entryPoint: {
          address: entryPoint07Address,
          version: '0.7',
        },
        safe4337ModuleAddress: SAFE_7579_MODULE_ADDRESS,
        erc7579LaunchpadAddress: ERC7579_LAUNCHPAD_ADDRESS,
        attesters: [RHINESTONE_ATTESTER_ADDRESS],
        attestersThreshold: 1,
        validators: [
          {
            address: ownableValidator.address,
            context: ownableValidator.initData,
          },
          {
            address: smartSessionsValidator.address,
            context: smartSessionsValidator.initData,
          },
        ],
      };

      safeAccount = await toSafeSmartAccount(erc7579Params);
    }
  }

  const bundlerTransport = http(bundlerUrl);
  const paymasterClient = createPimlicoClient({
    transport: bundlerTransport,
    chain: chain,
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  });

  const smartAccount = createSmartAccountClient({
    chain: chain,
    account: safeAccount,
    paymaster: paymasterClient,
    bundlerTransport,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await paymasterClient.getUserOperationGasPrice()).fast;
      },
    },
  });

  return smartAccount;
}
