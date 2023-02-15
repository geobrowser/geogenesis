// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {ISpace} from './ISpace.sol';

struct Entry {
    string uri;
    address author;
}

/**
 * An immutable log of uri strings. The log is permissionless, so anyone can add
 * new entries.
 */
contract PermissionlessSpace is
    ISpace,
    Initializable
{
    // *** Constants ***

    // *** State variables ***

    Entry[] _entries;

    // *** Initialize upgradeable instance ***

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
    }

    // *** Entries ***

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
