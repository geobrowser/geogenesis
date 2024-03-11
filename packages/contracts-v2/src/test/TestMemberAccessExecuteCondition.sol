// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {MemberAccessExecuteCondition} from "../conditions/MemberAccessExecuteCondition.sol";

/// @notice The condition associated with `TestSharedPlugin`
contract TestMemberAccessExecuteCondition is MemberAccessExecuteCondition {
    constructor(address _targetContract) MemberAccessExecuteCondition(_targetContract) {}

    function getSelector(bytes memory _data) public pure returns (bytes4 selector) {
        return super._getSelector(_data);
    }

    function decodeAddRemoveMemberCalldata(
        bytes memory _data
    ) public pure returns (bytes4 sig, address account) {
        return super._decodeAddRemoveMemberCalldata(_data);
    }
}
