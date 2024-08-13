export const abi = [
  {
    inputs: [
      {
        internalType: 'contract DAORegistry',
        name: '_registry',
        type: 'address',
      },
      {
        internalType: 'contract PluginSetupProcessor',
        name: '_pluginSetupProcessor',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [],
    name: 'NoPluginProvided',
    type: 'error',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'trustedForwarder',
            type: 'address',
          },
          {
            internalType: 'string',
            name: 'daoURI',
            type: 'string',
          },
          {
            internalType: 'string',
            name: 'subdomain',
            type: 'string',
          },
          {
            internalType: 'bytes',
            name: 'metadata',
            type: 'bytes',
          },
        ],
        internalType: 'struct DAOFactory.DAOSettings',
        name: '_daoSettings',
        type: 'tuple',
      },
      {
        components: [
          {
            components: [
              {
                components: [
                  {
                    internalType: 'uint8',
                    name: 'release',
                    type: 'uint8',
                  },
                  {
                    internalType: 'uint16',
                    name: 'build',
                    type: 'uint16',
                  },
                ],
                internalType: 'struct PluginRepo.Tag',
                name: 'versionTag',
                type: 'tuple',
              },
              {
                internalType: 'contract PluginRepo',
                name: 'pluginSetupRepo',
                type: 'address',
              },
            ],
            internalType: 'struct PluginSetupRef',
            name: 'pluginSetupRef',
            type: 'tuple',
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes',
          },
        ],
        internalType: 'struct DAOFactory.PluginSettings[]',
        name: '_pluginSettings',
        type: 'tuple[]',
      },
    ],
    name: 'createDao',
    outputs: [
      {
        internalType: 'contract DAO',
        name: 'createdDao',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'daoBase',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'daoRegistry',
    outputs: [
      {
        internalType: 'contract DAORegistry',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'pluginSetupProcessor',
    outputs: [
      {
        internalType: 'contract PluginSetupProcessor',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'protocolVersion',
    outputs: [
      {
        internalType: 'uint8[3]',
        name: '',
        type: 'uint8[3]',
      },
    ],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes4',
        name: '_interfaceId',
        type: 'bytes4',
      },
    ],
    name: 'supportsInterface',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
