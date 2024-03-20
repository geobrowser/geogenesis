import {expect} from 'chai';
import {BigNumber} from 'ethers';

export type VersionTag = {release: BigNumber; build: BigNumber};

export enum Operation {
  Grant,
  Revoke,
  GrantWithCondition,
}

export function getNamedTypesFromMetadata(inputs: any): string[] {
  const types: string[] = [];

  for (const input of inputs) {
    if (input.type.startsWith('tuple')) {
      const tupleResult = getNamedTypesFromMetadata(input.components).join(
        ', '
      );

      let tupleString = `tuple(${tupleResult})`;

      if (input.type.endsWith('[]')) {
        tupleString = tupleString.concat('[]');
      }

      types.push(tupleString);
    } else if (input.type.endsWith('[]')) {
      const baseType = input.type.slice(0, -2);
      types.push(`${baseType}[] ${input.name}`);
    } else {
      types.push(`${input.type} ${input.name}`);
    }
  }

  return types;
}

describe('getNamedTypesFromMetadata', function () {
  it('simple', async () => {
    const json = {
      inputs: [
        {
          name: 'number',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'account',
          type: 'address',
          internalType: 'address',
        },
      ],
    };

    expect(getNamedTypesFromMetadata(json.inputs)).to.deep.equal([
      'uint256 number',
      'address account',
    ]);
  });

  it('array', async () => {
    const json = {
      inputs: [
        {
          internalType: 'address[]',
          name: 'members',
          type: 'address[]',
        },
      ],
    };

    expect(getNamedTypesFromMetadata(json.inputs)).to.deep.equal([
      'address[] members',
    ]);
  });

  it('struct', async () => {
    const json = {
      inputs: [
        {
          components: [
            {
              internalType: 'bool',
              name: 'onlyListed',
              type: 'bool',
            },
            {
              internalType: 'uint16',
              name: 'minApprovals',
              type: 'uint16',
            },
          ],
          internalType: 'struct Multisig.MultisigSettings',
          name: 'multisigSettings',
          type: 'tuple',
        },
      ],
    };

    expect(getNamedTypesFromMetadata(json.inputs)).to.deep.equal([
      'tuple(bool onlyListed, uint16 minApprovals)',
    ]);
  });

  it('nested struct', async () => {
    const json = {
      inputs: [
        {
          components: [
            {
              internalType: 'bool',
              name: 'var1',
              type: 'bool',
            },
            {
              components: [
                {
                  internalType: 'bool',
                  name: 'var2',
                  type: 'bool',
                },
                {
                  internalType: 'uint16',
                  name: 'var3',
                  type: 'uint16',
                },
                {
                  components: [
                    {
                      internalType: 'bool',
                      name: 'var4',
                      type: 'bool',
                    },
                    {
                      internalType: 'uint16',
                      name: 'var5',
                      type: 'uint16',
                    },
                    {
                      internalType: 'bytes',
                      name: 'var6',
                      type: 'bytes',
                    },
                  ],
                  internalType: 'struct Example',
                  name: 'layer3',
                  type: 'tuple',
                },
              ],
              internalType: 'struct Example',
              name: 'layer2',
              type: 'tuple',
            },
          ],
          internalType: 'struct Example',
          name: 'layer1',
          type: 'tuple',
        },
      ],
    };

    expect(getNamedTypesFromMetadata(json.inputs)).to.deep.equal([
      'tuple(bool var1, tuple(bool var2, uint16 var3, tuple(bool var4, uint16 var5, bytes var6)))',
    ]);
  });

  it('array of structs', async () => {
    const json = {
      inputs: [
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
          indexed: false,
          internalType: 'struct IDAO.Action[]',
          name: 'actions',
          type: 'tuple[]',
        },
      ],
    };

    expect(getNamedTypesFromMetadata(json.inputs)).to.deep.equal([
      'tuple(address to, uint256 value, bytes data)[]',
    ]);
  });

  it('nested array of structs', async () => {
    const json = {
      inputs: [
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
              indexed: false,
              internalType: 'struct IDAO.Action[]',
              name: 'actions',
              type: 'tuple[]',
            },
          ],
          indexed: false,
          internalType: 'struct IDAO.Action[]',
          name: 'actions',
          type: 'tuple[]',
        },
      ],
    };

    expect(getNamedTypesFromMetadata(json.inputs)).to.deep.equal([
      'tuple(address to, uint256 value, bytes data, tuple(address to, uint256 value, bytes data)[])[]',
    ]);
  });
});
