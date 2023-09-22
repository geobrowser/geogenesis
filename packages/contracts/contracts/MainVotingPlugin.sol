// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {IDAO, PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";
import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {IMembership} from "@aragon/osx/core/plugin/membership/IMembership.sol";
import {Addresslist} from "@aragon/osx/plugins/utils/Addresslist.sol";
import {RATIO_BASE, _applyRatioCeiled} from "@aragon/osx/plugins/utils/Ratio.sol";
import {IMajorityVoting} from "@aragon/osx/plugins/governance/majority-voting/IMajorityVoting.sol";
import {MajorityVotingBase} from "@aragon/osx/plugins/governance/majority-voting/MajorityVotingBase.sol";
import {MEMBER_PERMISSION_ID} from "./constants.sol";

// The [ERC-165](https://eips.ethereum.org/EIPS/eip-165) interface ID of the contract.
bytes4 constant MAIN_SPACE_VOTING_INTERFACE_ID = MainVotingPlugin.initialize.selector ^
    MainVotingPlugin.addAddresses.selector ^
    MainVotingPlugin.removeAddresses.selector ^
    MainVotingPlugin.isMember.selector ^
    MainVotingPlugin.isEditor.selector;

/// @title MainVotingPlugin
/// @author Aragon Association - 2021-2023.
/// @notice The majority voting implementation using a list of member addresses.
/// @dev This contract inherits from `MajorityVotingBase` and implements the `IMajorityVoting` interface.
contract MainVotingPlugin is IMembership, Addresslist, MajorityVotingBase {
    using SafeCastUpgradeable for uint256;

    /// @notice The ID of the permission required to call the `addAddresses` and `removeAddresses` functions.
    bytes32 public constant UPDATE_ADDRESSES_PERMISSION_ID =
        keccak256("UPDATE_ADDRESSES_PERMISSION");

    /// @notice Raised when more than one editor is attempted to be added or removed
    error OnlyOneEditorPerCall(uint256 length);

    /// @notice Raised when attempting to remove the last editor
    error NoEditorsLeft();

    /// @notice Raised when a wallet who is not an editor or a member attempts to do something
    error NotAMember(address caller);

    modifier onlyMembers() {
        if (!isMember(_msgSender())) {
            revert NotAMember(_msgSender());
        }
        _;
    }

    /// @notice Initializes the component.
    /// @dev This method is required to support [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822).
    /// @param _dao The IDAO interface of the associated DAO.
    /// @param _votingSettings The voting settings.
    function initialize(
        IDAO _dao,
        VotingSettings calldata _votingSettings,
        address[] calldata _initialEditors
    ) external initializer {
        __MajorityVotingBase_init(_dao, _votingSettings);

        _addAddresses(_initialEditors);
        emit MembersAdded({members: _initialEditors});
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
        return
            _interfaceId == MAIN_SPACE_VOTING_INTERFACE_ID ||
            _interfaceId == type(Addresslist).interfaceId ||
            _interfaceId == type(IMembership).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    /// @notice Adds new members to the address list.
    /// @param _members The addresses of members to be added. NOTE: Only one member can be added at a time.
    /// @dev This function is used during the plugin initialization.
    function addAddresses(
        address[] calldata _members
    ) external auth(UPDATE_ADDRESSES_PERMISSION_ID) {
        if (_members.length > 1) revert OnlyOneEditorPerCall(_members.length);

        _addAddresses(_members);
        emit MembersAdded({members: _members});
    }

    /// @notice Removes existing members from the address list.
    /// @param _members The addresses of the members to be removed. NOTE: Only one member can be removed at a time.
    function removeAddresses(
        address[] calldata _members
    ) external auth(UPDATE_ADDRESSES_PERMISSION_ID) {
        if (_members.length > 1) revert OnlyOneEditorPerCall(_members.length);
        else if (addresslistLength() <= 1) revert NoEditorsLeft();

        _removeAddresses(_members);
        emit MembersRemoved({members: _members});
    }

    /// @inheritdoc MajorityVotingBase
    function totalVotingPower(uint256 _blockNumber) public view override returns (uint256) {
        return addresslistLengthAtBlock(_blockNumber);
    }

    /// @notice Returns whether the given address holds membership/editor permission on the main voting plugin
    function isMember(address _account) public view returns (bool) {
        return
            isEditor(_account) ||
            dao().hasPermission(address(this), _account, MEMBER_PERMISSION_ID, bytes(""));
    }

    /// @notice Returns whether the given address is currently listed as an editor
    function isEditor(address _account) public view returns (bool) {
        return isListed(_account);
    }

    /// @inheritdoc MajorityVotingBase
    function createProposal(
        bytes calldata _metadata,
        IDAO.Action[] calldata _actions,
        uint256 _allowFailureMap,
        uint64,
        uint64,
        VoteOption _voteOption,
        bool _tryEarlyExecution
    ) external override onlyMembers returns (uint256 proposalId) {
        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }
        uint64 _startDate = block.timestamp.toUint64();

        proposalId = _createProposal({
            _creator: _msgSender(),
            _metadata: _metadata,
            _startDate: _startDate,
            _endDate: _startDate + minDuration(),
            _actions: _actions,
            _allowFailureMap: _allowFailureMap
        });

        // Store proposal related information
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _startDate + minDuration();
        proposal_.parameters.snapshotBlock = snapshotBlock;
        proposal_.parameters.votingMode = votingMode();
        proposal_.parameters.supportThreshold = supportThreshold();
        proposal_.parameters.minVotingPower = _applyRatioCeiled(
            totalVotingPower(snapshotBlock),
            minParticipation()
        );

        // Reduce costs
        if (_allowFailureMap != 0) {
            proposal_.allowFailureMap = _allowFailureMap;
        }

        for (uint256 i; i < _actions.length; ) {
            proposal_.actions.push(_actions[i]);
            unchecked {
                ++i;
            }
        }

        if (_voteOption != VoteOption.None) {
            vote(proposalId, _voteOption, _tryEarlyExecution);
        }
    }

    /// @inheritdoc MajorityVotingBase
    function _vote(
        uint256 _proposalId,
        VoteOption _voteOption,
        address _voter,
        bool _tryEarlyExecution
    ) internal override {
        Proposal storage proposal_ = proposals[_proposalId];

        VoteOption state = proposal_.voters[_voter];

        // Remove the previous vote.
        if (state == VoteOption.Yes) {
            proposal_.tally.yes = proposal_.tally.yes - 1;
        } else if (state == VoteOption.No) {
            proposal_.tally.no = proposal_.tally.no - 1;
        } else if (state == VoteOption.Abstain) {
            proposal_.tally.abstain = proposal_.tally.abstain - 1;
        }

        // Store the updated/new vote for the voter.
        if (_voteOption == VoteOption.Yes) {
            proposal_.tally.yes = proposal_.tally.yes + 1;
        } else if (_voteOption == VoteOption.No) {
            proposal_.tally.no = proposal_.tally.no + 1;
        } else if (_voteOption == VoteOption.Abstain) {
            proposal_.tally.abstain = proposal_.tally.abstain + 1;
        }

        proposal_.voters[_voter] = _voteOption;

        emit VoteCast({
            proposalId: _proposalId,
            voter: _voter,
            voteOption: _voteOption,
            votingPower: 1
        });

        if (_tryEarlyExecution && _canExecute(_proposalId)) {
            _execute(_proposalId);
        }
    }

    /// @inheritdoc MajorityVotingBase
    function _canVote(
        uint256 _proposalId,
        address _account,
        VoteOption _voteOption
    ) internal view override returns (bool) {
        Proposal storage proposal_ = proposals[_proposalId];

        // The proposal vote hasn't started or has already ended.
        if (!_isProposalOpen(proposal_)) {
            return false;
        }

        // The voter votes `None` which is not allowed.
        if (_voteOption == VoteOption.None) {
            return false;
        }

        // The voter has no voting power.
        if (!isListedAtBlock(_account, proposal_.parameters.snapshotBlock)) {
            return false;
        }

        // The voter has already voted but vote replacement is not allowed.
        if (
            proposal_.voters[_account] != VoteOption.None &&
            proposal_.parameters.votingMode != VotingMode.VoteReplacement
        ) {
            return false;
        }

        return true;
    }

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    /// https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
