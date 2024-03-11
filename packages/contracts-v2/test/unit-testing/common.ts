import {BigNumber} from '@ethersproject/bignumber';
import {expect} from 'chai';
import {ethers} from 'hardhat';

export const abiCoder = ethers.utils.defaultAbiCoder;
export const EMPTY_DATA = '0x';
export const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
export const ONE_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

export const DEPLOYER_PERMISSION_ID = ethers.utils.id('DEPLOYER_PERMISSION');
export const EDITOR_PERMISSION_ID = ethers.utils.id('EDITOR_PERMISSION');

export const CONTENT_PERMISSION_ID = ethers.utils.id('CONTENT_PERMISSION');
export const SUBSPACE_PERMISSION_ID = ethers.utils.id('SUBSPACE_PERMISSION');

export const EXECUTE_PERMISSION_ID = ethers.utils.id('EXECUTE_PERMISSION');
export const UPDATE_MULTISIG_SETTINGS_PERMISSION_ID = ethers.utils.id(
  'UPDATE_MULTISIG_SETTINGS_PERMISSION'
);
export const UPDATE_VOTING_SETTINGS_PERMISSION_ID = ethers.utils.id(
  'UPDATE_VOTING_SETTINGS_PERMISSION'
);
export const UPDATE_ADDRESSES_PERMISSION_ID = ethers.utils.id(
  'UPDATE_ADDRESSES_PERMISSION'
);
export const UPGRADE_PLUGIN_PERMISSION_ID = ethers.utils.id(
  'UPGRADE_PLUGIN_PERMISSION'
);
export const ROOT_PERMISSION_ID = ethers.utils.id('ROOT_PERMISSION');

export const MAX_UINT64 = ethers.BigNumber.from(2).pow(64).sub(1);
export const ADDRESS_ZERO = ethers.constants.AddressZero;
export const ADDRESS_ONE = `0x${'0'.repeat(39)}1`;
export const ADDRESS_TWO = `0x${'0'.repeat(39)}2`;
export const ADDRESS_THREE = `0x${'0'.repeat(39)}3`;
export const NO_CONDITION = ADDRESS_ZERO;

export async function getTime(): Promise<number> {
  return (await ethers.provider.getBlock('latest')).timestamp;
}

export function mineBlock() {
  return ethers.provider.send('evm_mine', []);
}

export async function advanceTime(time: number) {
  await ethers.provider.send('evm_increaseTime', [time]);
  await ethers.provider.send('evm_mine', []);
}

export async function advanceTimeTo(timestamp: number) {
  const delta = timestamp - (await getTime());
  await advanceTime(delta);
}

export async function advanceIntoVoteTime(startDate: number, endDate: number) {
  await advanceTimeTo(startDate);
  expect(await getTime()).to.be.greaterThanOrEqual(startDate);
  expect(await getTime()).to.be.lessThan(endDate);
}

export async function advanceAfterVoteEnd(endDate: number) {
  await advanceTimeTo(endDate);
  expect(await getTime()).to.be.greaterThanOrEqual(endDate);
}

// MAIN VOTING PLUGIN

export const RATIO_BASE = ethers.BigNumber.from(10).pow(6); // 100% => 10**6
export const pctToRatio = (x: number) => RATIO_BASE.mul(x).div(100);

export enum VoteOption {
  None = 0,
  Abstain = 1,
  Yes = 2,
  No = 3,
}

export enum VotingMode {
  Standard,
  EarlyExecution,
  VoteReplacement,
}

export type VotingSettings = {
  votingMode: number;
  supportThreshold: BigNumber;
  minParticipation: BigNumber;
  duration: number;
};

export const defaultMainVotingSettings: VotingSettings = {
  duration: 60 * 60, // 1 second
  minParticipation: pctToRatio(30), // 30%
  supportThreshold: pctToRatio(50), // 50% + 1
  votingMode: VotingMode.EarlyExecution,
};
