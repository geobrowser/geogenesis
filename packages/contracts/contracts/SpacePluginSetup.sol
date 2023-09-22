// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {PermissionLib} from "@aragon/osx/core/permission/PermissionLib.sol";
import {PluginSetup, IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetup.sol";
import {SpacePlugin} from "./SpacePlugin.sol";
import {CONTENT_PERMISSION_ID, SUBSPACE_PERMISSION_ID} from "./constants.sol";

/// @title SpacePluginSetup
/// @dev Release 1, Build 1
contract SpacePluginSetup is PluginSetup {
    address private immutable pluginImplementation;

    constructor() {
        pluginImplementation = address(new SpacePlugin());
    }

    /// @inheritdoc IPluginSetup
    function prepareInstallation(
        address _dao,
        bytes memory _data
    ) external returns (address plugin, PreparedSetupData memory preparedSetupData) {
        // Decode incoming params
        (string memory firstBlockContentUri, address _pluginUpgrader) = abi.decode(
            _data,
            (string, address)
        );

        // Deploy new plugin instance
        plugin = createERC1967Proxy(
            pluginImplementation,
            abi.encodeWithSelector(SpacePlugin.initialize.selector, _dao, firstBlockContentUri)
        );

        PermissionLib.MultiTargetPermission[]
            memory permissions = new PermissionLib.MultiTargetPermission[](
                _pluginUpgrader == address(0x0) ? 3 : 4
            );

        // The DAO can emit content
        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: CONTENT_PERMISSION_ID
        });
        // The DAO can accept a subspace
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: SUBSPACE_PERMISSION_ID
        });

        // The DAO needs to be able to upgrade the plugin
        permissions[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: SpacePlugin(pluginImplementation).UPGRADE_PLUGIN_PERMISSION_ID()
        });

        // pluginUpgrader needs to be able to upgrade the plugin
        if (_pluginUpgrader != address(0x0)) {
            permissions[3] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Grant,
                where: plugin,
                who: _pluginUpgrader,
                condition: PermissionLib.NO_CONDITION,
                permissionId: SpacePlugin(pluginImplementation).UPGRADE_PLUGIN_PERMISSION_ID()
            });
        }

        preparedSetupData.permissions = permissions;
    }

    /// @inheritdoc IPluginSetup
    function prepareUninstallation(
        address _dao,
        SetupPayload calldata _payload
    ) external view returns (PermissionLib.MultiTargetPermission[] memory permissionChanges) {
        // Decode incoming params
        address _pluginUpgrader = abi.decode(_payload.data, (address));

        permissionChanges = new PermissionLib.MultiTargetPermission[](
            _pluginUpgrader == address(0x0) ? 3 : 4
        );

        // The DAO can make it emit content
        permissionChanges[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: CONTENT_PERMISSION_ID
        });
        // The DAO can make it accept/reject a subspace
        permissionChanges[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: SUBSPACE_PERMISSION_ID
        });
        permissionChanges[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: SpacePlugin(_payload.plugin).UPGRADE_PLUGIN_PERMISSION_ID()
        });
        if (_pluginUpgrader != address(0x0)) {
            permissionChanges[3] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Revoke,
                where: _payload.plugin,
                who: _pluginUpgrader,
                condition: PermissionLib.NO_CONDITION,
                permissionId: SpacePlugin(_payload.plugin).UPGRADE_PLUGIN_PERMISSION_ID()
            });
        }
    }

    /// @inheritdoc IPluginSetup
    function implementation() external view returns (address) {
        return pluginImplementation;
    }
}
