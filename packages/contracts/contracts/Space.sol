// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {ISpace} from './ISpace.sol';

struct Entry {
    string uri;
    address author;
}

/**
 * An immutable log of uri strings.
 *
 * Supported roles:
 * - ADMIN_ROLE can grant/revoke ADMIN_ROLE and EDITOR_CONTROLLER_ROLE
 * - EDITOR_CONTROLLER_ROLE can grant/revoke EDITOR_ROLE
 * - EDITOR_ROLE can add new log entries
 */
contract Space is
    ISpace,
    Initializable,
    OwnableUpgradeable,
    AccessControlUpgradeable
{
    // *** Constants ***

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant EDITOR_CONTROLLER_ROLE =
        keccak256('EDITOR_CONTROLLER_ROLE');
    bytes32 public constant EDITOR_ROLE = keccak256('EDITOR_ROLE');

    // *** State variables ***

    Entry[] _entries;
    bool public _rolesConfigured;

    // *** Initialize upgradeable instance ***

    function initialize() public initializer {
        __Ownable_init();
        __AccessControl_init();
    }

    // *** Access control ***

    // Configure roles in separate function so graph-node picks up events.
    // Seems like events on dynamic data sources aren't picked up if
    // emitted in the constructor. Presumably this is because we add
    // the dynamic data source after the contract is deployed, and
    // graph-node doesn't pick up events emitted before the data source
    // was added.
    function configureRoles() public onlyOwner {
        if (_rolesConfigured) return;

        _rolesConfigured = true;

        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(EDITOR_CONTROLLER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(EDITOR_ROLE, EDITOR_CONTROLLER_ROLE);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(EDITOR_CONTROLLER_ROLE, msg.sender);
        _grantRole(EDITOR_ROLE, msg.sender);
    }

    // *** Entries ***

    function addEntry(string calldata uri) public onlyRole(EDITOR_ROLE) {
        Entry memory entry = Entry({uri: uri, author: msg.sender});

        uint256 index = _entries.length;

        _entries.push(entry);

        emit EntryAdded(index, uri, msg.sender);
    }

    function addEntries(string[] calldata uris) public onlyRole(EDITOR_ROLE) {
        for (uint256 i = 0; i < uris.length; i++) {
            addEntry(uris[i]);
        }
    }

    function entryCount() public view returns (uint256) {
        return _entries.length;
    }

    function entryAtIndex(uint256 index) public view returns (Entry memory) {
        return _entries[index];
    }

    function entries(uint256 offset, uint256 limit)
        public
        view
        returns (Entry[] memory)
    {
        uint256 count = entryCount();
        uint256 upper = min(count - offset, limit);
        Entry[] memory output = new Entry[](upper);

        for (uint256 index = 0; index < upper; index++) {
            output[index] = entryAtIndex(offset + index);
        }

        return output;
    }

    function min(uint256 a, uint256 b) private pure returns (uint256) {
        return a <= b ? a : b;
    }
}
