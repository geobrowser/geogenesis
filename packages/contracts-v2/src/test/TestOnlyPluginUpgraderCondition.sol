// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {OnlyPluginUpgraderCondition} from "../conditions/OnlyPluginUpgraderCondition.sol";

/// @notice The condition associated with `TestSharedPlugin`
contract TestOnlyPluginUpgraderCondition is OnlyPluginUpgraderCondition {
    constructor(
        DAO _dao,
        PluginSetupProcessor _psp,
        address[] memory _targetPluginAddresses
    ) OnlyPluginUpgraderCondition(_dao, _psp, _targetPluginAddresses) {}

    function getSelector(bytes memory _data) public pure returns (bytes4 selector) {
        return super._getSelector(_data);
    }

    function decodeGrantRevokeCalldata(
        bytes memory _data
    ) public pure returns (bytes4 selector, address where, address who, bytes32 permissionId) {
        return super._decodeGrantRevokeCalldata(_data);
    }

    function decodeApplyUpdateCalldata(
        bytes memory _data
    ) public pure returns (bytes4 selector, address daoAddress, address targetPluginAddress) {
        return super._decodeApplyUpdateCalldata(_data);
    }

    function isValidGrantRevokeCalldata(
        bytes memory _grantData,
        bytes memory _revokeData
    ) public view returns (bool) {
        return super._isValidGrantRevokeCalldata(_grantData, _revokeData);
    }

    function isValidApplyUpdateCalldata(bytes memory _data) public view returns (bool) {
        return super._isValidApplyUpdateCalldata(_data);
    }
}
