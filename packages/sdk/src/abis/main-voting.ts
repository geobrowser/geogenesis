export const abi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_member",
        "type": "address"
      }
    ],
    "name": "AlreadyAMember",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_editor",
        "type": "address"
      }
    ],
    "name": "AlreadyAnEditor",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_member",
        "type": "address"
      }
    ],
    "name": "AlreadyNotAMember",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_editor",
        "type": "address"
      }
    ],
    "name": "AlreadyNotAnEditor",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "dao",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "where",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "who",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "permissionId",
        "type": "bytes32"
      }
    ],
    "name": "DaoUnauthorized",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "limit",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "actual",
        "type": "uint64"
      }
    ],
    "name": "DateOutOfBounds",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "limit",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "actual",
        "type": "uint64"
      }
    ],
    "name": "DurationOutOfBounds",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "EmptyContent",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "member",
        "type": "address"
      }
    ],
    "name": "InvalidAddresslistUpdate",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "InvalidInterface",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoEditorsLeft",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "caller",
        "type": "address"
      }
    ],
    "name": "NotAMember",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotAnEditor",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyCreatorCanCancel",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "length",
        "type": "uint256"
      }
    ],
    "name": "OnlyOneEditorPerCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "ProposalCreationForbidden",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "name": "ProposalExecutionForbidden",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProposalIsNotOpen",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "limit",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "actual",
        "type": "uint256"
      }
    ],
    "name": "RatioOutOfBounds",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "Unauthorized",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "internalType": "enum IMajorityVoting.VoteOption",
        "name": "voteOption",
        "type": "uint8"
      }
    ],
    "name": "VoteCastForbidden",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "previousAdmin",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "newAdmin",
        "type": "address"
      }
    ],
    "name": "AdminChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "beacon",
        "type": "address"
      }
    ],
    "name": "BeaconUpgraded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "dao",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "editor",
        "type": "address"
      }
    ],
    "name": "EditorAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "dao",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "editor",
        "type": "address"
      }
    ],
    "name": "EditorLeft",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "dao",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "editor",
        "type": "address"
      }
    ],
    "name": "EditorRemoved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address[]",
        "name": "editors",
        "type": "address[]"
      }
    ],
    "name": "EditorsAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "version",
        "type": "uint8"
      }
    ],
    "name": "Initialized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "dao",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "member",
        "type": "address"
      }
    ],
    "name": "MemberAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "dao",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "member",
        "type": "address"
      }
    ],
    "name": "MemberLeft",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "dao",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "member",
        "type": "address"
      }
    ],
    "name": "MemberRemoved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "name": "ProposalCanceled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "startDate",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "endDate",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "metadata",
        "type": "bytes"
      },
      {
        "components": [
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "value",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "indexed": false,
        "internalType": "struct IDAO.Action[]",
        "name": "actions",
        "type": "tuple[]"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "allowFailureMap",
        "type": "uint256"
      }
    ],
    "name": "ProposalCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "name": "ProposalExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "implementation",
        "type": "address"
      }
    ],
    "name": "Upgraded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "voter",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "enum IMajorityVoting.VoteOption",
        "name": "voteOption",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "votingPower",
        "type": "uint256"
      }
    ],
    "name": "VoteCast",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "enum MajorityVotingBase.VotingMode",
        "name": "votingMode",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "supportThreshold",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "duration",
        "type": "uint64"
      }
    ],
    "name": "VotingSettingsUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "UPDATE_ADDRESSES_PERMISSION_ID",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "UPDATE_VOTING_SETTINGS_PERMISSION_ID",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "UPGRADE_PLUGIN_PERMISSION_ID",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      }
    ],
    "name": "addEditor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      }
    ],
    "name": "addMember",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "addresslistLength",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_blockNumber",
        "type": "uint256"
      }
    ],
    "name": "addresslistLengthAtBlock",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      }
    ],
    "name": "canExecute",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "_voter",
        "type": "address"
      },
      {
        "internalType": "enum IMajorityVoting.VoteOption",
        "name": "_voteOption",
        "type": "uint8"
      }
    ],
    "name": "canVote",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      }
    ],
    "name": "cancelProposal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_metadataContentUri",
        "type": "bytes"
      },
      {
        "components": [
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "value",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct IDAO.Action[]",
        "name": "_actions",
        "type": "tuple[]"
      },
      {
        "internalType": "uint256",
        "name": "_allowFailureMap",
        "type": "uint256"
      },
      {
        "internalType": "enum IMajorityVoting.VoteOption",
        "name": "_voteOption",
        "type": "uint8"
      },
      {
        "internalType": "bool",
        "name": "_tryEarlyExecution",
        "type": "bool"
      }
    ],
    "name": "createProposal",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "dao",
    "outputs": [
      {
        "internalType": "contract IDAO",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "duration",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      }
    ],
    "name": "execute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      }
    ],
    "name": "getProposal",
    "outputs": [
      {
        "internalType": "bool",
        "name": "open",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "executed",
        "type": "bool"
      },
      {
        "components": [
          {
            "internalType": "enum MajorityVotingBase.VotingMode",
            "name": "votingMode",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "supportThreshold",
            "type": "uint32"
          },
          {
            "internalType": "uint64",
            "name": "startDate",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "endDate",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "snapshotBlock",
            "type": "uint64"
          }
        ],
        "internalType": "struct MajorityVotingBase.ProposalParameters",
        "name": "parameters",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "abstain",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "yes",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "no",
            "type": "uint256"
          }
        ],
        "internalType": "struct MajorityVotingBase.Tally",
        "name": "tally",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "value",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct IDAO.Action[]",
        "name": "actions",
        "type": "tuple[]"
      },
      {
        "internalType": "uint256",
        "name": "allowFailureMap",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "_voter",
        "type": "address"
      }
    ],
    "name": "getVoteOption",
    "outputs": [
      {
        "internalType": "enum IMajorityVoting.VoteOption",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "implementation",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "contract IDAO",
        "name": "_dao",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "enum MajorityVotingBase.VotingMode",
            "name": "votingMode",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "supportThreshold",
            "type": "uint32"
          },
          {
            "internalType": "uint64",
            "name": "duration",
            "type": "uint64"
          }
        ],
        "internalType": "struct MajorityVotingBase.VotingSettings",
        "name": "_votingSettings",
        "type": "tuple"
      },
      {
        "internalType": "address[]",
        "name": "_initialEditors",
        "type": "address[]"
      },
      {
        "internalType": "contract MemberAccessPlugin",
        "name": "_memberAccessPlugin",
        "type": "address"
      }
    ],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      }
    ],
    "name": "isEditor",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      }
    ],
    "name": "isListed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_blockNumber",
        "type": "uint256"
      }
    ],
    "name": "isListedAtBlock",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      }
    ],
    "name": "isMember",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      }
    ],
    "name": "isMinParticipationReached",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      }
    ],
    "name": "isSupportThresholdReached",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      }
    ],
    "name": "isSupportThresholdReachedEarly",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "leaveSpace",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "leaveSpaceAsEditor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "memberAccessPlugin",
    "outputs": [
      {
        "internalType": "contract MemberAccessPlugin",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pluginType",
    "outputs": [
      {
        "internalType": "enum IPlugin.PluginType",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "proposalCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_metadataContentUri",
        "type": "bytes"
      },
      {
        "internalType": "contract IDAO",
        "name": "_subspaceDao",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_spacePlugin",
        "type": "address"
      }
    ],
    "name": "proposeAcceptSubspace",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_metadataContentUri",
        "type": "bytes"
      },
      {
        "internalType": "address",
        "name": "_proposedEditor",
        "type": "address"
      }
    ],
    "name": "proposeAddEditor",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_metadataContentUri",
        "type": "bytes"
      },
      {
        "internalType": "address",
        "name": "_proposedMember",
        "type": "address"
      }
    ],
    "name": "proposeAddMember",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_metadataContentUri",
        "type": "bytes"
      },
      {
        "internalType": "string",
        "name": "_editsContentUri",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "_spacePlugin",
        "type": "address"
      }
    ],
    "name": "proposeEdits",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_metadataContentUri",
        "type": "bytes"
      },
      {
        "internalType": "address",
        "name": "_editor",
        "type": "address"
      }
    ],
    "name": "proposeRemoveEditor",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_metadataContentUri",
        "type": "bytes"
      },
      {
        "internalType": "address",
        "name": "_member",
        "type": "address"
      }
    ],
    "name": "proposeRemoveMember",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_metadataContentUri",
        "type": "bytes"
      },
      {
        "internalType": "contract IDAO",
        "name": "_subspaceDao",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_spacePlugin",
        "type": "address"
      }
    ],
    "name": "proposeRemoveSubspace",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "proxiableUUID",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      }
    ],
    "name": "removeEditor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      }
    ],
    "name": "removeMember",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "supportThreshold",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_interfaceId",
        "type": "bytes4"
      }
    ],
    "name": "supportsInterface",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_blockNumber",
        "type": "uint256"
      }
    ],
    "name": "totalVotingPower",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "enum MajorityVotingBase.VotingMode",
            "name": "votingMode",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "supportThreshold",
            "type": "uint32"
          },
          {
            "internalType": "uint64",
            "name": "duration",
            "type": "uint64"
          }
        ],
        "internalType": "struct MajorityVotingBase.VotingSettings",
        "name": "_votingSettings",
        "type": "tuple"
      }
    ],
    "name": "updateVotingSettings",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newImplementation",
        "type": "address"
      }
    ],
    "name": "upgradeTo",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newImplementation",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "upgradeToAndCall",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_proposalId",
        "type": "uint256"
      },
      {
        "internalType": "enum IMajorityVoting.VoteOption",
        "name": "_voteOption",
        "type": "uint8"
      },
      {
        "internalType": "bool",
        "name": "_tryEarlyExecution",
        "type": "bool"
      }
    ],
    "name": "vote",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "votingMode",
    "outputs": [
      {
        "internalType": "enum MajorityVotingBase.VotingMode",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const