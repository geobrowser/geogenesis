import {
  createSmartAccountClient,
  type SmartAccountClient,
} from 'permissionless'
import {
  type SafeSmartAccountImplementation,
  type ToSafeSmartAccountParameters,
  toSafeSmartAccount,
} from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import {
  createPublicClient,
  http,
  type Address,
  type Chain,
  type HttpTransport,
  type WalletClient,
} from 'viem'
import {
  entryPoint07Address,
  type SmartAccountImplementation,
} from 'viem/account-abstraction'

type SafeSmartAccount = SafeSmartAccountImplementation<'0.7'> & {
  address: Address
  getNonce: NonNullable<SmartAccountImplementation['getNonce']>
  isDeployed: () => Promise<boolean>
  type: 'smart'
}

type GeoSmartAccount = SmartAccountClient<
  HttpTransport<undefined, false>,
  Chain,
  object &
    SafeSmartAccount & {
      address: Address
      getNonce: NonNullable<SmartAccountImplementation['getNonce']>
      isDeployed: () => Promise<boolean>
      type: 'smart'
    },
  undefined,
  undefined
>

type GenerateSmartAccountParams = {
  rpcUrl: string
  bundlerUrl: string
  chain: Chain
  walletClient: WalletClient
}

export async function generateSmartAccount({
  rpcUrl,
  bundlerUrl,
  chain,
  walletClient,
}: GenerateSmartAccountParams): Promise<GeoSmartAccount> {
  const transport = http(rpcUrl)
  const publicClient = createPublicClient({
    transport,
    chain,
  })

  const safeAccountParams: ToSafeSmartAccountParameters<'0.7', undefined> = {
    client: publicClient,
    owners: [walletClient],
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
    version: '1.4.1',
  }

  // TESTNET
  if (chain.id === 19411) {
    // Custom SAFE Addresses
    // TODO: remove this once we have the smart sessions module deployed on testnet
    // (and the canonical addresses are deployed)
    safeAccountParams.safeModuleSetupAddress =
      '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47'
    safeAccountParams.safe4337ModuleAddress =
      '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226'
    safeAccountParams.safeProxyFactoryAddress =
      '0xd9d2Ba03a7754250FDD71333F444636471CACBC4'
    safeAccountParams.safeSingletonAddress =
      '0x639245e8476E03e789a244f279b5843b9633b2E7'
    safeAccountParams.multiSendAddress =
      '0x7B21BBDBdE8D01Df591fdc2dc0bE9956Dde1e16C'
    safeAccountParams.multiSendCallOnlyAddress =
      '0x32228dDEA8b9A2bd7f2d71A958fF241D79ca5eEC'
  }

  const safeAccount = await toSafeSmartAccount(safeAccountParams)

  const bundlerTransport = http(bundlerUrl)
  const paymasterClient = createPimlicoClient({
    transport: bundlerTransport,
    chain: chain,
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  })

  const smartAccount = createSmartAccountClient({
    chain: chain,
    account: safeAccount,
    paymaster: paymasterClient,
    bundlerTransport,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await paymasterClient.getUserOperationGasPrice()).fast
      },
    },
  })

  return smartAccount
}
