// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;
import {Space} from '../Space.sol';

/**
 * FakeSpaceV2 is a fake implementation for upgrading to a new version of the Space contract.
 */
contract FakeSpaceV2 is Space {
    bool public _hasBananas;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initializeV2() public reinitializer(2) {
        _hasBananas = true;
    }
}
