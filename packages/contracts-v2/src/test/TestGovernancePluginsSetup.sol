// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {PermissionLib} from "@aragon/osx/core/permission/PermissionLib.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PluginSetup, IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetup.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {TestMemberAccessPlugin} from "./TestMemberAccessPlugin.sol";
import {MemberAccessExecuteCondition} from "../conditions/MemberAccessExecuteCondition.sol";
import {OnlyPluginUpgraderCondition} from "../conditions/OnlyPluginUpgraderCondition.sol";
import {MainVotingPlugin} from "../governance/MainVotingPlugin.sol";
import {MajorityVotingBase} from "../governance/base/MajorityVotingBase.sol";

// Not ideal, but to test this E2E, the contract needs to be cloned
contract TestGovernancePluginsSetup is PluginSetup {
    address private immutable mainVotingPluginImplementationAddr;
    address public immutable memberAccessPluginImplementationAddr;
    address private immutable pluginSetupProcessor;

    /// @notice Thrown when the array of helpers does not have the correct size
    error InvalidHelpers(uint256 actualLength);

    /// @notice Initializes the setup contract
    /// @param pluginSetupProcessorAddress The address of the PluginSetupProcessor contract deployed by Aragon on that chain
    constructor(PluginSetupProcessor pluginSetupProcessorAddress) {
        pluginSetupProcessor = address(pluginSetupProcessorAddress);
        mainVotingPluginImplementationAddr = address(new MainVotingPlugin());
        memberAccessPluginImplementationAddr = address(new TestMemberAccessPlugin());
    }

    /// @inheritdoc IPluginSetup
    /// @notice Prepares the installation of the two governance plugins in one go
    function prepareInstallation(
        address _dao,
        bytes memory _data
    ) external returns (address mainVotingPlugin, PreparedSetupData memory preparedSetupData) {
        // Decode the custom installation parameters
        (
            MajorityVotingBase.VotingSettings memory _votingSettings,
            address[] memory _initialEditors,
            uint64 _memberAccessProposalDuration,
            address _pluginUpgrader
        ) = decodeInstallationParams(_data);

        // Deploy the main voting plugin
        mainVotingPlugin = createERC1967Proxy(
            mainVotingPluginImplementationAddr,
            abi.encodeCall(
                MainVotingPlugin.initialize,
                (IDAO(_dao), _votingSettings, _initialEditors)
            )
        );

        // Deploy the member access plugin
        TestMemberAccessPlugin.MultisigSettings memory _multisigSettings;
        _multisigSettings.proposalDuration = _memberAccessProposalDuration;
        _multisigSettings.mainVotingPlugin = MainVotingPlugin(mainVotingPlugin);

        address _memberAccessPlugin = createERC1967Proxy(
            memberAccessPluginImplementation(),
            abi.encodeCall(TestMemberAccessPlugin.initialize, (IDAO(_dao), _multisigSettings))
        );

        // Condition contract (member access plugin execute)
        address _memberAccessExecuteCondition = address(
            new MemberAccessExecuteCondition(mainVotingPlugin)
        );

        // List the requested permissions
        PermissionLib.MultiTargetPermission[]
            memory permissions = new PermissionLib.MultiTargetPermission[](
                _pluginUpgrader == address(0x0) ? 5 : 6
            );

        // The main voting plugin can execute on the DAO
        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: _dao,
            who: mainVotingPlugin,
            condition: PermissionLib.NO_CONDITION,
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
        // The DAO can update the main voting plugin settings
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: mainVotingPlugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: MainVotingPlugin(mainVotingPluginImplementationAddr)
                .UPDATE_VOTING_SETTINGS_PERMISSION_ID()
        });
        // The DAO can manage the list of addresses
        permissions[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: mainVotingPlugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: MainVotingPlugin(mainVotingPluginImplementationAddr)
                .UPDATE_ADDRESSES_PERMISSION_ID()
        });

        // The member access plugin needs to execute on the DAO
        permissions[3] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.GrantWithCondition,
            where: _dao,
            who: _memberAccessPlugin,
            condition: _memberAccessExecuteCondition,
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
        // The DAO needs to be able to update the member access plugin settings
        permissions[4] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: _memberAccessPlugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: TestMemberAccessPlugin(_memberAccessPlugin)
                .UPDATE_MULTISIG_SETTINGS_PERMISSION_ID()
        });

        // The DAO doesn't need APPLY_UPDATE_PERMISSION_ID on the PSP

        // pluginUpgrader permissions
        if (_pluginUpgrader != address(0x0)) {
            // pluginUpgrader can make the DAO execute applyUpdate
            // pluginUpgrader can make the DAO execute grant/revoke
            address[] memory _targetPluginAddresses = new address[](2);
            _targetPluginAddresses[0] = mainVotingPlugin;
            _targetPluginAddresses[1] = _memberAccessPlugin;
            OnlyPluginUpgraderCondition _onlyPluginUpgraderCondition = new OnlyPluginUpgraderCondition(
                    DAO(payable(_dao)),
                    PluginSetupProcessor(pluginSetupProcessor),
                    _targetPluginAddresses
                );
            permissions[5] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.GrantWithCondition,
                where: _dao,
                who: _pluginUpgrader,
                condition: address(_onlyPluginUpgraderCondition),
                permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
            });
        }

        preparedSetupData.permissions = permissions;
        preparedSetupData.helpers = new address[](1);
        preparedSetupData.helpers[0] = _memberAccessPlugin;
    }

    /// @notice WARNING: This test function is meant to revert when performed by the pluginUpgrader
    function prepareUpdate(
        address _dao,
        uint16 _currentBuild,
        SetupPayload calldata _payload
    )
        external
        view
        override
        returns (bytes memory initData, PreparedSetupData memory preparedSetupData)
    {
        (_currentBuild, _payload, initData);
        bool _requestSomeNewPermission = decodeUpdateParams(_payload.data);

        if (_requestSomeNewPermission) {
            PermissionLib.MultiTargetPermission[]
                memory permissions = new PermissionLib.MultiTargetPermission[](1);

            // This is here to make things revert
            // when requested by pluginUpgrader
            permissions[0] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Grant,
                where: _dao,
                who: _dao,
                condition: PermissionLib.NO_CONDITION,
                permissionId: DAO(payable(_dao)).SET_METADATA_PERMISSION_ID()
            });

            preparedSetupData.permissions = permissions;
        }
    }

    /// @inheritdoc IPluginSetup
    function prepareUninstallation(
        address _dao,
        SetupPayload calldata _payload
    ) external view returns (PermissionLib.MultiTargetPermission[] memory permissionChanges) {
        if (_payload.currentHelpers.length != 1) {
            revert InvalidHelpers(_payload.currentHelpers.length);
        }

        // Decode incoming params
        address _pluginUpgrader = decodeUninstallationParams(_payload.data);
        address _memberAccessPlugin = _payload.currentHelpers[0];

        permissionChanges = new PermissionLib.MultiTargetPermission[](
            _pluginUpgrader == address(0x0) ? 5 : 6
        );

        // Main voting plugin permissions

        // The plugin can no longer execute on the DAO
        permissionChanges[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _dao,
            who: _payload.plugin,
            condition: address(0),
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
        // The DAO can no longer update the plugin settings
        permissionChanges[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: address(0),
            permissionId: MainVotingPlugin(mainVotingPluginImplementationAddr)
                .UPDATE_VOTING_SETTINGS_PERMISSION_ID()
        });
        // The DAO can no longer manage the list of addresses
        permissionChanges[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: address(0),
            permissionId: MainVotingPlugin(mainVotingPluginImplementationAddr)
                .UPDATE_ADDRESSES_PERMISSION_ID()
        });

        // Member access plugin permissions

        // The plugin can no longer execute on the DAO
        permissionChanges[3] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _dao,
            who: _memberAccessPlugin,
            condition: address(0),
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
        // The DAO can no longer update the plugin settings
        permissionChanges[4] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _memberAccessPlugin,
            who: _dao,
            condition: address(0),
            permissionId: TestMemberAccessPlugin(memberAccessPluginImplementation())
                .UPDATE_MULTISIG_SETTINGS_PERMISSION_ID()
        });

        if (_pluginUpgrader != address(0x0)) {
            // pluginUpgrader can no longer make the DAO execute applyUpdate
            // pluginUpgrader can no longer make the DAO execute grant/revoke
            permissionChanges[5] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Revoke,
                where: _dao,
                who: _pluginUpgrader,
                condition: address(0),
                permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
            });
        }
    }

    /// @inheritdoc IPluginSetup
    function implementation() external view virtual returns (address) {
        return mainVotingPluginImplementationAddr;
    }

    /// @notice Returns the address of the MemberAccessPlugin implementation
    function memberAccessPluginImplementation() public view returns (address) {
        return memberAccessPluginImplementationAddr;
    }

    /// @notice Encodes the given installation parameters into a byte array
    function encodeInstallationParams(
        MajorityVotingBase.VotingSettings calldata _votingSettings,
        address[] calldata _initialEditors,
        uint64 _memberAccessProposalDuration,
        address _pluginUpgrader
    ) public pure returns (bytes memory) {
        return
            abi.encode(
                _votingSettings,
                _initialEditors,
                _memberAccessProposalDuration,
                _pluginUpgrader
            );
    }

    /// @notice Decodes the given byte array into the original installation parameters
    function decodeInstallationParams(
        bytes memory _data
    )
        public
        pure
        returns (
            MajorityVotingBase.VotingSettings memory votingSettings,
            address[] memory initialEditors,
            uint64 memberAccessProposalDuration,
            address pluginUpgrader
        )
    {
        (votingSettings, initialEditors, memberAccessProposalDuration, pluginUpgrader) = abi.decode(
            _data,
            (MajorityVotingBase.VotingSettings, address[], uint64, address)
        );
    }

    /// @notice Encodes the given update parameters into a byte array
    function encodeUpdateParams(bool _requestSomeNewPermission) public pure returns (bytes memory) {
        return abi.encode(_requestSomeNewPermission);
    }

    /// @notice Decodes the given byte array into the original update parameters
    function decodeUpdateParams(
        bytes memory _data
    ) public pure returns (bool requestSomeNewPermission) {
        (requestSomeNewPermission) = abi.decode(_data, (bool));
    }

    /// @notice Encodes the given uninstallation parameters into a byte array
    function encodeUninstallationParams(
        address _pluginUpgrader
    ) public pure returns (bytes memory) {
        return abi.encode(_pluginUpgrader);
    }

    /// @notice Decodes the given byte array into the original uninstallation parameters
    function decodeUninstallationParams(
        bytes memory _data
    ) public pure returns (address pluginUpgrader) {
        (pluginUpgrader) = abi.decode(_data, (address));
    }
}
