// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import '@openzeppelin/contracts/access/AccessControl.sol';
import {ISpace} from './ISpace.sol';

/**
 * An immutable log of uri strings.
 */
contract Space is ISpace, AccessControl {
    struct Entry {
        string uri;
        address author;
    }

    Entry[] _entries;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant EDITOR_ROLE = keccak256('EDITOR_ROLE');

    constructor() {
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(EDITOR_ROLE, ADMIN_ROLE);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(EDITOR_ROLE, msg.sender);
    }

    function addEntry(string calldata uri) public {
        Entry memory entry = Entry({uri: uri, author: msg.sender});

        uint256 index = _entries.length;

        _entries.push(entry);

        emit EntryAdded(index, uri, msg.sender);
    }

    function addEntries(string[] calldata uris) public {
        for (uint256 i = 0; i < uris.length; i++) {
            addEntry(uris[i]);
        }
    }

    // Enumeration

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
