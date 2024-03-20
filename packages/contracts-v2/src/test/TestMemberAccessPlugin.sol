// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {MemberAccessPlugin} from "../governance/MemberAccessPlugin.sol";

/// @notice A clone of the MemberAccessPlugin contract, just to test
contract TestMemberAccessPlugin is MemberAccessPlugin {
    function createArbitraryProposal(
        bytes calldata _metadata,
        IDAO.Action[] memory _actions
    ) public returns (uint256 proposalId) {
        // Exposing createProposal for E2E testing
        return createProposal(_metadata, _actions);
    }

    function initialize(
        IDAO _dao,
        MultisigSettings calldata _multisigSettings
    ) public override initializer {
        __PluginUUPSUpgradeable_init(_dao);

        _updateMultisigSettings(_multisigSettings);
    }
}
