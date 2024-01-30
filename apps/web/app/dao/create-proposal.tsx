'use client';

import { bytesToString, encodeAbiParameters, fromBytes, hexToString, stringToBytes, stringToHex, toBytes } from 'viem';

import { useContractWrite, usePrepareContractWrite } from 'wagmi';

import { Button } from '~/design-system/button';

import { abi } from './main-voting-abi';

enum VoteOption {
  None = 0,
  Abstain = 1,
  Yes = 2,
  No = 3,
}

const createProposalInputs = [
  {
    internalType: 'bytes',
    name: '_metadata',
    type: 'bytes',
  },
  {
    components: [
      {
        internalType: 'address',
        name: 'to',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'value',
        type: 'uint256',
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
    ],
    internalType: 'struct IDAO.Action[]',
    name: '_actions',
    type: 'tuple[]',
  },
  {
    internalType: 'uint256',
    name: '_allowFailureMap',
    type: 'uint256',
  },
  {
    internalType: 'uint64',
    name: '',
    type: 'uint64',
  },
  {
    internalType: 'uint64',
    name: '',
    type: 'uint64',
  },
  {
    internalType: 'enum IMajorityVoting.VoteOption',
    name: '_voteOption',
    type: 'uint8',
  },
  {
    internalType: 'bool',
    name: '_tryEarlyExecution',
    type: 'bool',
  },
] as const;

const processProposalInputs = [
  {
    internalType: 'uint32',
    name: '_blockIndex',
    type: 'uint32',
  },
  {
    internalType: 'uint32',
    name: '_itemIndex',
    type: 'uint32',
  },
  {
    internalType: 'string',
    name: '_contentUri',
    type: 'string',
  },
] as const;

function createProposalEncoding() {
  // @TODO: Add metadata to ipfs. this will include the root object. If the proposal is not a content proposal it will use
  // a new type of metadata object that has the proposal type and version object

  // 1. Create the proposal metadata for content
  // 2. Create the proposal metadata for a subspace
  //    - Add subspace
  //    - Remove subspace
  // 3. Create the proposal metadata for a member
  //    - Add member
  //    - Remove member
  // 4. Create the proposal metadata for an editor
  //    - Add editor
  //    - Remove editor
  // 5. Create action for processing a content proposal
  // 6. Create action for processing a subspace proposal
  //    - Add subspace
  //    - Remove subspace
  // 7. Create action for processing a member proposal
  //    - Add member
  //    - Remove member
  // 8. Create action for processing an editor proposal
  //    - Add editor
  //    - Remove editor
  const encodedParams = encodeAbiParameters(createProposalInputs, [
    // @HACK to work around encodeAbiParameters not being able to encode
    // utf8 byte arrays
    // https://github.com/wevm/viem/issues/926
    fromBytes(stringToBytes('ipfs://QmTMt24BWFBPX7T3G6EquF8jt9odkeWvdzrFia6bvE3C3d'), 'hex'), // Some random IPFS entry from the subgraph
    [],
    BigInt(0),
    BigInt(0),
    BigInt(0),
    VoteOption.Yes,
    true,
  ]);

  return encodedParams;
}

interface Props {
  type:
    | 'content'
    | 'add-member'
    | 'remove-member'
    | 'add-editor'
    | 'remove-editor'
    | 'add-subspace'
    | 'remove-subspace';
}

export function CreateProposal({ type }: Props) {
  const { config } = usePrepareContractWrite({
    chainId: 137,
    address: '0xB4c6f281B29216a601A743D09151c2eb6EE17dB6',
    abi,
    functionName: 'createProposal',
    args: [
      stringToHex('ipfs://QmTMt24BWFBPX7T3G6EquF8jt9odkeWvdzrFia6bvE3C3d'),
      [
        {
          to: '0xE6fCF2ecB8DA3d02e0A0f78A1ec933c10Cfb3612',
          value: BigInt(0),
          data: encodeAbiParameters(processProposalInputs, [
            1,
            2,
            stringToHex('ipfs://QmTMt24BWFBPX7T3G6EquF8jt9odkeWvdzrFia6bvE3C3d'),
          ]),
        },
      ],
      BigInt(0),
      BigInt(0),
      BigInt(0),
      VoteOption.Yes,
      true,
    ],
  });

  const writer = useContractWrite(config);

  const onClick = () => {
    writer.write?.();
  };

  return <Button onClick={onClick}>Create proposal</Button>;
}
