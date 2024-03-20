import {activeContractsList} from '@aragon/osx-ethers';
import {ContractFactory, ContractTransaction} from 'ethers';
import {
  defaultAbiCoder,
  Interface,
  keccak256,
  LogDescription,
} from 'ethers/lib/utils';
import {ethers} from 'hardhat';
import {upgrades} from 'hardhat';

export type NetworkNameMapping = {[index: string]: string};

export type ContractList = {[index: string]: {[index: string]: string}};

export type ContractBlockNumberList = {
  // network
  [index: string]: {
    [index: string]: {address: string; blockNumber: number};
  };
};

export const osxContracts: ContractList = activeContractsList;

export const networkNameMapping: NetworkNameMapping = {
  mainnet: 'mainnet',
  goerli: 'goerli',
  polygon: 'polygon',
  polygonMumbai: 'mumbai',
  baseGoerli: 'baseGoerli',
};

export const ERRORS = {
  ALREADY_INITIALIZED: 'Initializable: contract is already initialized',
};

export function getPluginRepoFactoryAddress(networkName: string): string {
  let pluginRepoFactoryAddr: string;

  if (
    networkName === 'localhost' ||
    networkName === 'hardhat' ||
    networkName === 'coverage'
  ) {
    const hardhatForkNetwork = process.env.NETWORK_NAME ?? 'mainnet';

    pluginRepoFactoryAddr = osxContracts[hardhatForkNetwork].PluginRepoFactory;
    console.log(
      `Using the "${hardhatForkNetwork}" PluginRepoFactory address (${pluginRepoFactoryAddr}) for deployment testing on network "${networkName}"`
    );
  } else {
    pluginRepoFactoryAddr =
      osxContracts[networkNameMapping[networkName]].PluginRepoFactory;

    console.log(
      `Using the ${networkNameMapping[networkName]} PluginRepoFactory address (${pluginRepoFactoryAddr}) for deployment...`
    );
  }
  return pluginRepoFactoryAddr;
}

export function getPluginSetupProcessorAddress(
  networkName: string,
  silent = false
): string {
  let pluginSetupProcessorAddr: string;

  if (
    networkName === 'localhost' ||
    networkName === 'hardhat' ||
    networkName === 'coverage'
  ) {
    const hardhatForkNetwork = process.env.NETWORK_NAME ?? 'mainnet';

    pluginSetupProcessorAddr =
      osxContracts[hardhatForkNetwork].PluginSetupProcessor;
    if (!silent) {
      console.log(
        `Using the "${hardhatForkNetwork}" PluginSetupProcessor address (${pluginSetupProcessorAddr}) for deployment testing on network "${networkName}"`
      );
    }
  } else {
    pluginSetupProcessorAddr =
      osxContracts[networkNameMapping[networkName]].PluginSetupProcessor;

    if (!silent) {
      console.log(
        `Using the ${networkNameMapping[networkName]} PluginSetupProcessor address (${pluginSetupProcessorAddr}) for deployment...`
      );
    }
  }
  return pluginSetupProcessorAddr;
}

export async function findEvent<T>(tx: ContractTransaction, eventName: string) {
  const receipt = await tx.wait();

  const event = (receipt.events || []).find(event => event.event === eventName);

  return event as T | undefined;
}

export async function findEventTopicLog<T>(
  tx: ContractTransaction,
  iface: Interface,
  eventName: string
): Promise<LogDescription & (T | LogDescription)> {
  const receipt = await tx.wait();
  const topic = iface.getEventTopic(eventName);
  const log = receipt.logs.find(x => x.topics[0] === topic);
  if (!log) {
    throw new Error(`No logs found for the topic of event "${eventName}".`);
  }
  return iface.parseLog(log) as LogDescription & (T | LogDescription);
}

type DeployOptions = {
  constructurArgs?: unknown[];
  proxyType?: 'uups';
};

export async function deployWithProxy<T>(
  contractFactory: ContractFactory,
  options: DeployOptions = {}
): Promise<T> {
  upgrades.silenceWarnings(); // Needed because we pass the `unsafeAllow: ["constructor"]` option.

  return upgrades.deployProxy(contractFactory, [], {
    kind: options.proxyType || 'uups',
    initializer: false,
    unsafeAllow: ['constructor'],
    constructorArgs: options.constructurArgs || [],
  }) as unknown as Promise<T>;
}

export function toBytes(string: string) {
  return ethers.utils.formatBytes32String(string);
}

export function hashHelpers(helpers: string[]) {
  return keccak256(defaultAbiCoder.encode(['address[]'], [helpers]));
}

export function toBytes32(num: number): string {
  const hex = num.toString(16);
  return `0x${'0'.repeat(64 - hex.length)}${hex}`;
}
