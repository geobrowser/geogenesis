//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.14;


interface ISpaceFactory {
   event OriginalOwner(address owner);
   event SelfAddress(address owner);

  /**
    Q: Do we need to rate-limit this somehow?
  */
  function createSpace() external returns (address newSpace);
  function version() external pure returns (string memory);
}