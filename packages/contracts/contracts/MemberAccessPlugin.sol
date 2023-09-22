// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";
import {ProposalUpgradeable} from "@aragon/osx/core/plugin/proposal/ProposalUpgradeable.sol";
import {IMultisig} from "@aragon/osx/plugins/governance/multisig/IMultisig.sol";
import {MainVotingPlugin, MAIN_SPACE_VOTING_INTERFACE_ID} from "./MainVotingPlugin.sol";
import {MEMBER_PERMISSION_ID} from "./constants.sol";

bytes4 constant MULTISIG_INTERFACE_ID = MemberAccessPlugin.initialize.selector ^
    MemberAccessPlugin.updateMultisigSettings.selector ^
    MemberAccessPlugin.getProposal.selector;

/// @title Multisig - Release 1, Build 1
/// @author Aragon Association - 2022-2023
/// @notice The on-chain multisig governance plugin in which a proposal passes if X out of Y approvals are met.
contract MemberAccessPlugin is IMultisig, PluginUUPSUpgradeable, ProposalUpgradeable {
    using SafeCastUpgradeable for uint256;

    /// @notice The ID of the permission required to call the `addAddresses` and `removeAddresses` functions.
    bytes32 public constant UPDATE_MULTISIG_SETTINGS_PERMISSION_ID =
        keccak256("UPDATE_MULTISIG_SETTINGS_PERMISSION");

    /// @notice The minimum amount of approvals required for proposals created by a non-editor
    uint16 internal constant MIN_APPROVALS_NON_EDITOR = uint16(1);

    /// @notice The minimum amount of approvals required for proposals created by an editor (single)
    uint16 internal constant MIN_APPROVALS_EDITOR_SINGLE = uint16(1);

    /// @notice The minimum amount of approvals required for proposals created by an editor (multiple)
    uint16 internal constant MIN_APPROVALS_EDITOR_MANY = uint16(2);

    /// @notice A container for proposal-related information.
    /// @param executed Whether the proposal is executed or not.
    /// @param approvals The number of approvals casted.
    /// @param parameters The proposal-specific approve settings at the time of the proposal creation.
    /// @param approvers The approves casted by the approvers.
    /// @param actions The actions to be executed when the proposal passes.
    /// @param _failsafeActionMap A bitmap allowing the proposal to succeed, even if certain actions might revert. If the bit at index `i` is 1, the proposal succeeds even if the `i`th action reverts. A failure map value of 0 requires every action to not revert.
    struct Proposal {
        bool executed;
        uint16 approvals;
        ProposalParameters parameters;
        mapping(address => bool) approvers;
        IDAO.Action[] actions;
        uint256 failsafeActionMap;
    }

    /// @notice A container for the proposal parameters.
    /// @param minApprovals The number of approvals required.
    /// @param snapshotBlock The number of the block prior to the proposal creation.
    /// @param startDate The timestamp when the proposal starts.
    /// @param endDate The timestamp when the proposal expires.
    struct ProposalParameters {
        uint16 minApprovals;
        uint64 snapshotBlock;
        uint64 startDate;
        uint64 endDate;
    }

    /// @notice A container for the plugin settings.
    /// @param proposalDuration The amount of time before a non-approved proposal expires.
    /// @param mainVotingPlugin The address of the main voting plugin. Used to apply permissions for it.
    struct MultisigSettings {
        uint64 proposalDuration;
        MainVotingPlugin mainVotingPlugin;
    }

    /// @notice A mapping between proposal IDs and proposal information.
    mapping(uint256 => Proposal) internal proposals;

    /// @notice The current plugin settings.
    MultisigSettings public multisigSettings;

    /// @notice Keeps track at which block number the multisig settings have been changed the last time.
    /// @dev This variable prevents a proposal from being created in the same block in which the multisig settings change.
    uint64 public lastMultisigSettingsChange;

    /// @notice Thrown when a sender is not allowed to create a proposal.
    /// @param sender The sender address.
    error ProposalCreationForbidden(address sender);

    /// @notice Thrown if an approver is not allowed to cast an approve. This can be because the proposal
    /// - is not open,
    /// - was executed, or
    /// - the approver is not on the address list
    /// @param proposalId The ID of the proposal.
    /// @param sender The address of the sender.
    error ApprovalCastForbidden(uint256 proposalId, address sender);

    /// @notice Thrown if the proposal execution is forbidden.
    /// @param proposalId The ID of the proposal.
    error ProposalExecutionForbidden(uint256 proposalId);

    /// @notice Thrown when attempting to use addAddresses and removeAddresses.
    error AddresslistDisabled();

    /// @notice Thrown when attempting to use an invalid contract.
    error InvalidContract();

    /// @notice Thrown when attempting request membership for a current member.
    error AlreadyMember(address _member);

    /// @notice Thrown when attempting propose removing membership for a non-member.
    error AlreadyNotMember(address _member);

    /// @notice Emitted when a proposal is approved by an editor.
    /// @param proposalId The ID of the proposal.
    /// @param editor The editor casting the approve.
    event Approved(uint256 indexed proposalId, address indexed editor);

    /// @notice Emitted when a proposal is rejected by an editor.
    /// @param proposalId The ID of the proposal.
    /// @param editor The editor casting the rejection.
    event Rejected(uint256 indexed proposalId, address indexed editor);

    /// @notice Emitted when the plugin settings are set.
    /// @param proposalDuration The amount of time before a non-approved proposal expires.
    /// @param mainVotingPlugin The address of the main voting plugin for the space. Used to apply permissions for it.
    event MultisigSettingsUpdated(uint64 proposalDuration, address mainVotingPlugin);

    /// @notice Initializes Release 1, Build 1.
    /// @dev This method is required to support [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822).
    /// @param _dao The IDAO interface of the associated DAO.
    /// @param _multisigSettings The multisig settings.
    function initialize(
        IDAO _dao,
        MultisigSettings calldata _multisigSettings
    ) external initializer {
        __PluginUUPSUpgradeable_init(_dao);

        _updateMultisigSettings(_multisigSettings);
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(
        bytes4 _interfaceId
    ) public view virtual override(PluginUUPSUpgradeable, ProposalUpgradeable) returns (bool) {
        return
            _interfaceId == MULTISIG_INTERFACE_ID ||
            _interfaceId == type(IMultisig).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    /// @notice This function is kept for compatibility with the multisig base class, but will not produce any effect.
    function addAddresses(
        address[] calldata
    ) external view auth(UPDATE_MULTISIG_SETTINGS_PERMISSION_ID) {
        revert AddresslistDisabled();
    }

    /// @notice This function is kept for compatibility with the multisig base class, but will not produce any effect.
    function removeAddresses(
        address[] calldata
    ) external view auth(UPDATE_MULTISIG_SETTINGS_PERMISSION_ID) {
        revert AddresslistDisabled();
    }

    /// @notice Updates the plugin settings.
    /// @param _multisigSettings The new settings.
    function updateMultisigSettings(
        MultisigSettings calldata _multisigSettings
    ) external auth(UPDATE_MULTISIG_SETTINGS_PERMISSION_ID) {
        _updateMultisigSettings(_multisigSettings);
    }

    /// @notice Creates a new multisig proposal wrapped by proposeNewMember and proposeRemoveMember.
    /// @param _metadata The metadata of the proposal.
    /// @param _actions A list of actions wrapped by proposeNewMember and proposeRemoveMember.
    /// @return proposalId The ID of the proposal.
    function createProposal(
        bytes calldata _metadata,
        IDAO.Action[] memory _actions
    ) internal returns (uint256 proposalId) {
        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }

        // Revert if the settings have been changed in the same block as this proposal should be created in.
        // This prevents a malicious party from voting with previous addresses and the new settings.
        if (lastMultisigSettingsChange > snapshotBlock) {
            revert ProposalCreationForbidden(_msgSender());
        }

        uint64 _startDate = block.timestamp.toUint64();
        uint64 _endDate = _startDate + multisigSettings.proposalDuration;

        proposalId = _createProposalId();

        emit ProposalCreated({
            proposalId: proposalId,
            creator: _msgSender(),
            metadata: _metadata,
            startDate: _startDate,
            endDate: _endDate,
            actions: _actions,
            allowFailureMap: uint8(0)
        });

        // Create the proposal
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.snapshotBlock = snapshotBlock;
        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _endDate;

        for (uint256 i; i < _actions.length; ) {
            proposal_.actions.push(_actions[i]);
            unchecked {
                ++i;
            }
        }

        if (isEditor(_msgSender())) {
            if (multisigSettings.mainVotingPlugin.addresslistLength() < 2) {
                proposal_.parameters.minApprovals = MIN_APPROVALS_EDITOR_SINGLE;
            } else {
                proposal_.parameters.minApprovals = MIN_APPROVALS_EDITOR_MANY;
            }

            // If the creator is an editor, we assume that the editor approves
            approve(proposalId, false);
        } else {
            proposal_.parameters.minApprovals = MIN_APPROVALS_NON_EDITOR;
        }
    }

    /// @notice Creates a proposal to add a new member.
    /// @param _metadata The metadata of the proposal.
    /// @param _proposedMember The address of the member who may eveutnally be added.
    /// @return proposalId The ID of the proposal.
    function proposeNewMember(
        bytes calldata _metadata,
        address _proposedMember
    ) external returns (uint256 proposalId) {
        if (isMember(_proposedMember)) {
            revert AlreadyMember(_proposedMember);
        }

        // Build the list of actions
        IDAO.Action[] memory _actions = new IDAO.Action[](1);

        _actions[0] = IDAO.Action({
            to: address(dao()),
            value: 0,
            data: abi.encodeWithSelector(
                PermissionManager.grant.selector, // grant()
                address(multisigSettings.mainVotingPlugin), // where
                _proposedMember, // who
                MEMBER_PERMISSION_ID // permission ID
            )
        });

        return createProposal(_metadata, _actions);
    }

    /// @notice Creates a proposal to remove an existing member.
    /// @param _metadata The metadata of the proposal.
    /// @param _proposedMember The address of the member who may eveutnally be removed.
    /// @return proposalId The ID of the proposal.
    function proposeRemoveMember(
        bytes calldata _metadata,
        address _proposedMember
    ) external returns (uint256 proposalId) {
        if (!isMember(_proposedMember)) {
            revert AlreadyNotMember(_proposedMember);
        }

        // Build the list of actions
        IDAO.Action[] memory _actions = new IDAO.Action[](1);

        _actions[0] = IDAO.Action({
            to: address(dao()),
            value: 0,
            data: abi.encodeWithSelector(
                PermissionManager.revoke.selector, // revoke()
                address(multisigSettings.mainVotingPlugin), // where
                _proposedMember, // who
                MEMBER_PERMISSION_ID // permission ID
            )
        });

        return createProposal(_metadata, _actions);
    }

    /// @inheritdoc IMultisig
    /// @dev The second parameter is left empty to keep compatibility with the existing multisig interface
    function approve(uint256 _proposalId, bool) public {
        address sender = _msgSender();
        if (!_canApprove(_proposalId, sender)) {
            revert ApprovalCastForbidden(_proposalId, sender);
        }

        Proposal storage proposal_ = proposals[_proposalId];

        // As the list can never become more than type(uint16).max(due to addAddresses check)
        // It's safe to use unchecked as it would never overflow.
        unchecked {
            proposal_.approvals += 1;
        }

        proposal_.approvers[sender] = true;

        emit Approved({proposalId: _proposalId, editor: sender});

        if (_canExecute(_proposalId)) {
            _execute(_proposalId);
        }
    }

    /// @notice Rejects the given proposal immediately.
    function reject(uint256 _proposalId) public {
        address sender = _msgSender();
        if (!_canApprove(_proposalId, sender)) {
            revert ApprovalCastForbidden(_proposalId, sender);
        }

        Proposal storage proposal_ = proposals[_proposalId];

        // Prevent any further approvals, expire it
        proposal_.parameters.endDate = block.timestamp.toUint64();

        emit Rejected({proposalId: _proposalId, editor: sender});
    }

    /// @inheritdoc IMultisig
    function canApprove(uint256 _proposalId, address _account) external view returns (bool) {
        return _canApprove(_proposalId, _account);
    }

    /// @inheritdoc IMultisig
    function canExecute(uint256 _proposalId) external view returns (bool) {
        return _canExecute(_proposalId);
    }

    /// @notice Returns all information for a proposal vote by its ID.
    /// @param _proposalId The ID of the proposal.
    /// @return executed Whether the proposal is executed or not.
    /// @return approvals The number of approvals casted.
    /// @return parameters The parameters of the proposal vote.
    /// @return actions The actions to be executed in the associated DAO after the proposal has passed.
    /// @param failsafeActionMap A bitmap allowing the proposal to succeed, even if individual actions might revert. If the bit at index `i` is 1, the proposal succeeds even if the `i`th action reverts. A failure map value of 0 requires every action to not revert.
    function getProposal(
        uint256 _proposalId
    )
        public
        view
        returns (
            bool executed,
            uint16 approvals,
            ProposalParameters memory parameters,
            IDAO.Action[] memory actions,
            uint256 failsafeActionMap
        )
    {
        Proposal storage proposal_ = proposals[_proposalId];

        executed = proposal_.executed;
        approvals = proposal_.approvals;
        parameters = proposal_.parameters;
        actions = proposal_.actions;
        failsafeActionMap = proposal_.failsafeActionMap;
    }

    /// @inheritdoc IMultisig
    function hasApproved(uint256 _proposalId, address _account) public view returns (bool) {
        return proposals[_proposalId].approvers[_account];
    }

    /// @inheritdoc IMultisig
    function execute(uint256 _proposalId) public {
        if (!_canExecute(_proposalId)) {
            revert ProposalExecutionForbidden(_proposalId);
        }

        _execute(_proposalId);
    }

    /// @notice Returns whether the given address holds membership permission on the main voting plugin
    function isMember(address _account) public view returns (bool) {
        // Does the address hold the member or editor permission on the main voting plugin?
        return
            isEditor(_account) ||
            dao().hasPermission(
                address(multisigSettings.mainVotingPlugin),
                _account,
                MEMBER_PERMISSION_ID,
                bytes("")
            );
    }

    /// @notice Returns whether the given address holds editor permission on the main voting plugin
    function isEditor(address _account) public view returns (bool) {
        // Does the address hold the permission on the main voting plugin?
        return multisigSettings.mainVotingPlugin.isEditor(_account);
    }

    /// @notice Internal function to execute a vote. It assumes the queried proposal exists.
    /// @param _proposalId The ID of the proposal.
    function _execute(uint256 _proposalId) internal {
        Proposal storage proposal_ = proposals[_proposalId];

        proposal_.executed = true;

        _executeProposal(
            dao(),
            _proposalId,
            proposals[_proposalId].actions,
            proposals[_proposalId].failsafeActionMap
        );
    }

    /// @notice Internal function to check if an account can approve. It assumes the queried proposal exists.
    /// @param _proposalId The ID of the proposal.
    /// @param _account The account to check.
    /// @return Returns `true` if the given account can approve on a certain proposal and `false` otherwise.
    function _canApprove(uint256 _proposalId, address _account) internal view returns (bool) {
        Proposal storage proposal_ = proposals[_proposalId];

        if (!_isProposalOpen(proposal_)) {
            // The proposal was executed already
            return false;
        } else if (!isEditor(_account)) {
            // The approver has no voting power.
            return false;
        } else if (proposal_.approvers[_account]) {
            // The approver has already approved
            return false;
        }

        return true;
    }

    /// @notice Internal function to check if a proposal can be executed. It assumes the queried proposal exists.
    /// @param _proposalId The ID of the proposal.
    /// @return Returns `true` if the proposal can be executed and `false` otherwise.
    function _canExecute(uint256 _proposalId) internal view returns (bool) {
        Proposal storage proposal_ = proposals[_proposalId];

        // Verify that the proposal has not been executed or expired.
        if (!_isProposalOpen(proposal_)) {
            return false;
        }

        return proposal_.approvals >= proposal_.parameters.minApprovals;
    }

    /// @notice Internal function to check if a proposal vote is still open.
    /// @param proposal_ The proposal struct.
    /// @return True if the proposal vote is open, false otherwise.
    function _isProposalOpen(Proposal storage proposal_) internal view returns (bool) {
        uint64 currentTimestamp64 = block.timestamp.toUint64();
        return
            !proposal_.executed &&
            proposal_.parameters.startDate <= currentTimestamp64 &&
            proposal_.parameters.endDate >= currentTimestamp64;
    }

    /// @notice Internal function to update the plugin settings.
    /// @param _multisigSettings The new settings.
    function _updateMultisigSettings(MultisigSettings calldata _multisigSettings) internal {
        if (
            !MainVotingPlugin(_multisigSettings.mainVotingPlugin).supportsInterface(
                MAIN_SPACE_VOTING_INTERFACE_ID
            )
        ) {
            revert InvalidContract();
        }

        multisigSettings = _multisigSettings;
        lastMultisigSettingsChange = block.number.toUint64();

        emit MultisigSettingsUpdated({
            proposalDuration: _multisigSettings.proposalDuration,
            mainVotingPlugin: address(_multisigSettings.mainVotingPlugin)
        });
    }

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    /// https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
