// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {IDAO, PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";
import {CONTENT_PERMISSION_ID, SUBSPACE_PERMISSION_ID} from "../constants.sol";

bytes4 constant SPACE_INTERFACE_ID = SpacePlugin.initialize.selector ^
    SpacePlugin.processGeoProposal.selector ^
    SpacePlugin.acceptSubspace.selector ^
    SpacePlugin.removeSubspace.selector;

/// @title SpacePlugin
/// @dev Release 1, Build 1
contract SpacePlugin is PluginUUPSUpgradeable {
    /// @notice Emitted when the contents of a space change.
    /// @param blockIndex The index of the block whose items have new contents.
    /// @param itemIndex The index of the item that has new contents.
    /// @param contentUri An IPFS URI pointing to the new contents behind the block's item.
    event GeoProposalProcessed(uint32 blockIndex, uint32 itemIndex, string contentUri);

    /// @notice Announces that the current space plugin is the successor of an already existing Space
    /// @param predecessorSpace The address of the space contract that the plugin will replace
    event SuccessorSpaceCreated(address predecessorSpace);

    /// @notice Emitted when the DAO accepts another DAO as a subspace.
    /// @param subspaceDao The address of the DAO to be accepted as a subspace.
    event SubspaceAccepted(address subspaceDao);

    /// @notice Emitted when the DAO stops recognizing another DAO as a subspace.
    /// @param subspaceDao The address of the DAO to be removed as a subspace.
    event SubspaceRemoved(address subspaceDao);

    /// @notice Initializes the plugin when build 1 is installed.
    /// @param _dao The address of the DAO to read the permissions from.
    /// @param _firstBlockContentUri A IPFS URI pointing to the contents of the first block's item (title).
    /// @param _predecessorSpace Optionally, the address of the space contract preceding this one
    function initialize(
        IDAO _dao,
        string memory _firstBlockContentUri,
        address _predecessorSpace
    ) external initializer {
        __PluginUUPSUpgradeable_init(_dao);

        if (_predecessorSpace != address(0)) {
            emit SuccessorSpaceCreated(_predecessorSpace);
        }
        emit GeoProposalProcessed({blockIndex: 0, itemIndex: 0, contentUri: _firstBlockContentUri});
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(
        bytes4 _interfaceId
    ) public view override(PluginUUPSUpgradeable) returns (bool) {
        return _interfaceId == SPACE_INTERFACE_ID || super.supportsInterface(_interfaceId);
    }

    /// @notice Emits an event with new contents for the given block index. Caller needs CONTENT_PERMISSION.
    /// @param _blockIndex The index of the block whose items have new contents.
    /// @param _itemIndex The index of the item that has new contents.
    /// @param _contentUri An IPFS URI pointing to the new contents behind the block's item.
    function processGeoProposal(
        uint32 _blockIndex,
        uint32 _itemIndex,
        string memory _contentUri
    ) external auth(CONTENT_PERMISSION_ID) {
        emit GeoProposalProcessed({
            blockIndex: _blockIndex,
            itemIndex: _itemIndex,
            contentUri: _contentUri
        });
    }

    /// @notice Emits an event accepting another DAO as a subspace. Caller needs CONTENT_PERMISSION.
    /// @param _dao The address of the DAO to accept as a subspace.
    function acceptSubspace(address _dao) external auth(SUBSPACE_PERMISSION_ID) {
        emit SubspaceAccepted(_dao);
    }

    /// @notice Emits an event removing another DAO as a subspace. Caller needs CONTENT_PERMISSION.
    /// @param _dao The address of the DAO to remove as a subspace.
    function removeSubspace(address _dao) external auth(SUBSPACE_PERMISSION_ID) {
        emit SubspaceRemoved(_dao);
    }

    /// @notice This empty reserved space is put in place to allow future versions to add new variables without shifting down storage in the inheritance chain (see [OpenZeppelin's guide about storage gaps](https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps)).
    uint256[50] private __gap;
}
