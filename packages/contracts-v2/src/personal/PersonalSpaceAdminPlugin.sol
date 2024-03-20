// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {ProposalUpgradeable} from "@aragon/osx/core/plugin/proposal/ProposalUpgradeable.sol";
import {PluginCloneable} from "@aragon/osx/core/plugin/PluginCloneable.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {EDITOR_PERMISSION_ID} from "../constants.sol";

/// @title PersonalSpaceAdminPlugin
/// @author Aragon - 2023
/// @notice The admin governance plugin giving execution permission on the DAO to a single address.
contract PersonalSpaceAdminPlugin is PluginCloneable, ProposalUpgradeable {
    using SafeCastUpgradeable for uint256;

    /// @notice The [ERC-165](https://eips.ethereum.org/EIPS/eip-165) interface ID of the contract.
    bytes4 internal constant ADMIN_INTERFACE_ID =
        this.initialize.selector ^ this.executeProposal.selector;

    /// @notice Initializes the contract.
    /// @param _dao The associated DAO.
    /// @dev This method is required to support [ERC-1167](https://eips.ethereum.org/EIPS/eip-1167).
    function initialize(IDAO _dao) external initializer {
        __PluginCloneable_init(_dao);
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(
        bytes4 _interfaceId
    ) public view override(PluginCloneable, ProposalUpgradeable) returns (bool) {
        return _interfaceId == ADMIN_INTERFACE_ID || super.supportsInterface(_interfaceId);
    }

    /// @notice Returns whether the given address holds editor permission on the main voting plugin
    function isEditor(address _account) public view returns (bool) {
        // Does the address hold the permission on the main voting plugin?
        return dao().hasPermission(address(this), _account, EDITOR_PERMISSION_ID, bytes(""));
    }

    /// @notice Creates and executes a new proposal.
    /// @param _metadata The metadata of the proposal.
    /// @param _actions The actions to be executed.
    /// @param _allowFailureMap A bitmap allowing the proposal to succeed, even if individual actions might revert. If the bit at index `i` is 1, the proposal succeeds even if the `i`th action reverts. A failure map value of 0 requires every action to not revert.
    function executeProposal(
        bytes calldata _metadata,
        IDAO.Action[] calldata _actions,
        uint256 _allowFailureMap
    ) external auth(EDITOR_PERMISSION_ID) {
        uint64 currentTimestamp64 = block.timestamp.toUint64();

        uint256 proposalId = _createProposal({
            _creator: _msgSender(),
            _metadata: _metadata,
            _startDate: currentTimestamp64,
            _endDate: currentTimestamp64,
            _actions: _actions,
            _allowFailureMap: _allowFailureMap
        });
        _executeProposal(dao(), proposalId, _actions, _allowFailureMap);
    }
}
