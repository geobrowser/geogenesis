// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {PluginSetup, IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetup.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {PermissionLib} from "@aragon/osx/core/permission/PermissionLib.sol";
import {PersonalSpaceAdminPlugin} from "./PersonalSpaceAdminPlugin.sol";
import {EDITOR_PERMISSION_ID} from "../constants.sol";

/// @title PersonalSpaceAdminPluginSetup
/// @author Aragon - 2023
/// @notice The setup contract of the `PersonalSpaceAdminPlugin` plugin.
contract PersonalSpaceAdminPluginSetup is PluginSetup {
    using Clones for address;

    /// @notice The address of the `PersonalSpaceAdminPlugin` plugin logic contract to be cloned.
    address private immutable implementation_;

    /// @notice Thrown if the editor address is zero.
    /// @param editor The initial editor address.
    error EditorAddressInvalid(address editor);

    /// @notice The constructor setting the `PersonalSpaceAdminPlugin` implementation contract to clone from.
    constructor() {
        implementation_ = address(new PersonalSpaceAdminPlugin());
    }

    /// @inheritdoc IPluginSetup
    function prepareInstallation(
        address _dao,
        bytes calldata _data
    ) external returns (address plugin, PreparedSetupData memory preparedSetupData) {
        // Decode `_data` to extract the params needed for cloning and initializing the `PersonalSpaceAdminPlugin` plugin.
        address editor = decodeInstallationParams(_data);

        if (editor == address(0)) {
            revert EditorAddressInvalid({editor: editor});
        }

        // Clone plugin contract.
        plugin = implementation_.clone();

        // Initialize cloned plugin contract.
        PersonalSpaceAdminPlugin(plugin).initialize(IDAO(_dao));

        // Prepare permissions
        PermissionLib.MultiTargetPermission[]
            memory permissions = new PermissionLib.MultiTargetPermission[](2);

        // Grant `ADMIN_EXECUTE_PERMISSION` of the plugin to the editor.
        permissions[0] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            plugin,
            editor,
            PermissionLib.NO_CONDITION,
            EDITOR_PERMISSION_ID
        );

        // Grant `EXECUTE_PERMISSION` on the DAO to the plugin.
        permissions[1] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            _dao,
            plugin,
            PermissionLib.NO_CONDITION,
            DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        );

        preparedSetupData.permissions = permissions;
    }

    /// @inheritdoc IPluginSetup
    /// @dev Currently, there is no reliable way to revoke the `ADMIN_EXECUTE_PERMISSION_ID` from all addresses it has been granted to. Accordingly, only the `EXECUTE_PERMISSION_ID` is revoked for this uninstallation.
    function prepareUninstallation(
        address _dao,
        SetupPayload calldata _payload
    ) external view returns (PermissionLib.MultiTargetPermission[] memory permissions) {
        // Prepare permissions
        permissions = new PermissionLib.MultiTargetPermission[](1);

        // Revoke EXECUTE on the DAO
        permissions[0] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Revoke,
            _dao,
            _payload.plugin,
            PermissionLib.NO_CONDITION,
            DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        );
    }

    /// @inheritdoc IPluginSetup
    function implementation() external view returns (address) {
        return implementation_;
    }

    /// @notice Encodes the given installation parameters into a byte array
    function encodeInstallationParams(address _initialEditor) public pure returns (bytes memory) {
        return abi.encode(_initialEditor);
    }

    /// @notice Decodes the given byte array into the original installation parameters
    function decodeInstallationParams(
        bytes memory _data
    ) public pure returns (address initialEditor) {
        (initialEditor) = abi.decode(_data, (address));
    }
}
