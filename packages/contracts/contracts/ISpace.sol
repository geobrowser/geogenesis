// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

interface ISpace {
    event EntryAdded(uint256 index, string uri, address author);
}

struct Entry {
    string uri;
    address author;
}