// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {PermissionLib} from "@aragon/osx/core/permission/PermissionLib.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {PluginSetup, IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetup.sol";
import {MemberAccessPlugin} from "./MemberAccessPlugin.sol";
import {MemberAccessExecuteCondition} from "./MemberAccessExecuteCondition.sol";

/// @title MemberAccessPluginSetup
/// @dev Release 1, Build 1
contract MemberAccessPluginSetup is PluginSetup {
    address private immutable pluginImplementation;

    constructor() {
        pluginImplementation = address(new MemberAccessPlugin());
    }

    /// @inheritdoc IPluginSetup
    function prepareInstallation(
        address _dao,
        bytes memory _data
    ) external returns (address plugin, PreparedSetupData memory preparedSetupData) {
        (
            MemberAccessPlugin.MultisigSettings memory _multisigSettings,
            address _pluginUpgrader
        ) = abi.decode(_data, (MemberAccessPlugin.MultisigSettings, address));

        plugin = createERC1967Proxy(
            pluginImplementation,
            abi.encodeWithSelector(MemberAccessPlugin.initialize.selector, _dao, _multisigSettings)
        );

        // Condition contract
        address conditionContract = address(
            new MemberAccessExecuteCondition(address(_multisigSettings.mainVotingPlugin))
        );

        PermissionLib.MultiTargetPermission[]
            memory permissions = new PermissionLib.MultiTargetPermission[](
                _pluginUpgrader == address(0x0) ? 3 : 4
            );

        // The plugin needs to execute on the DAO
        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: _dao,
            who: plugin,
            condition: conditionContract,
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });

        // The DAO needs to be able to update the plugin settings
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: MemberAccessPlugin(pluginImplementation)
                .UPDATE_MULTISIG_SETTINGS_PERMISSION_ID()
        });

        // The DAO needs to be able to upgrade the plugin
        permissions[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: MemberAccessPlugin(pluginImplementation).UPGRADE_PLUGIN_PERMISSION_ID()
        });

        // pluginUpgrader needs to be able to upgrade the plugin
        if (_pluginUpgrader != address(0x0)) {
            permissions[3] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Grant,
                where: plugin,
                who: _pluginUpgrader,
                condition: PermissionLib.NO_CONDITION,
                permissionId: MemberAccessPlugin(pluginImplementation)
                    .UPGRADE_PLUGIN_PERMISSION_ID()
            });
        }

        preparedSetupData.permissions = permissions;
    }

    /// @inheritdoc IPluginSetup
    function prepareUninstallation(
        address _dao,
        SetupPayload calldata _payload
    ) external view returns (PermissionLib.MultiTargetPermission[] memory permissions) {
        // Decode incoming params
        address _pluginUpgrader = abi.decode(_payload.data, (address));

        permissions = new PermissionLib.MultiTargetPermission[](
            _pluginUpgrader == address(0x0) ? 3 : 4
        );

        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _dao,
            who: _payload.plugin,
            condition: PermissionLib.NO_CONDITION,
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: MemberAccessPlugin(pluginImplementation)
                .UPDATE_MULTISIG_SETTINGS_PERMISSION_ID()
        });
        permissions[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: MemberAccessPlugin(pluginImplementation).UPGRADE_PLUGIN_PERMISSION_ID()
        });
        if (_pluginUpgrader != address(0x0)) {
            permissions[3] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Revoke,
                where: _payload.plugin,
                who: _pluginUpgrader,
                condition: PermissionLib.NO_CONDITION,
                permissionId: MemberAccessPlugin(pluginImplementation)
                    .UPGRADE_PLUGIN_PERMISSION_ID()
            });
        }
    }

    /// @inheritdoc IPluginSetup
    function implementation() external view returns (address) {
        return pluginImplementation;
    }
}
