// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';

interface ISpace {
    event EntryAdded(uint256 index, string uri, address author);
}

contract SpaceRegistry is AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;

    event SpaceAdded(ISpace space);
    event SpaceRemoved(ISpace space);

    EnumerableSet.AddressSet _spaces;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant EDITOR_ROLE = keccak256('EDITOR_ROLE');

    constructor() {
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(EDITOR_ROLE, ADMIN_ROLE);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(EDITOR_ROLE, msg.sender);
    }

    function addSpace(ISpace space) public onlyRole(EDITOR_ROLE) {
        _spaces.add(address(space));

        emit SpaceAdded(space);
    }

    function removeSpace(ISpace space) public onlyRole(EDITOR_ROLE) {
        _spaces.remove(address(space));

        emit SpaceRemoved(space);
    }

    function hasSpace(ISpace space) public view returns (bool) {
        return _spaces.contains(address(space));
    }
    

    // Enumeration

    function spaceCount() public view returns (uint256) {
        return _spaces.length();
    }

    function spaceAtIndex(uint256 index) public view returns (ISpace) {
        return ISpace(_spaces.at(index));
    }

    function spaces(uint256 offset, uint256 limit)
        public
        view
        returns (ISpace[] memory)
    {
        uint256 count = spaceCount();
        uint256 upper = min(count - offset, limit);
        ISpace[] memory output = new ISpace[](upper);

        for (uint256 index = 0; index < upper; index++) {
            output[index] = spaceAtIndex(offset + index);
        }

        return output;
    }

    function min(uint256 a, uint256 b) private pure returns (uint256) {
        return a <= b ? a : b;
    }
}
