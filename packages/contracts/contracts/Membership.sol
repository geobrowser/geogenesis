// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

contract Membership {
  event MembershipRequested(address account, address space);

  function requestMembership(address space) external {
    emit MembershipRequested(msg.sender, space);
  }
}
