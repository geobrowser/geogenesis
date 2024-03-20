// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

// Import all contracts from other repositories to make the openzeppelin-upgrades package work to deploy things.
// See related issue here https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/86

import {DAOFactory} from "@aragon/osx/framework/dao/DAOFactory.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {PluginRepoFactory} from "@aragon/osx/framework/plugin/repo/PluginRepoFactory.sol";
