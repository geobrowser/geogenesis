//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.14;

import "./Space.sol";

contract SpaceFactory {
   string version = "0.0.1";
   Space[] public spaces;

  /**
    Q: Do we need to rate-limit this somehow?
  */
   function CreateSpace() public returns (address) {
     Space space = new Space();
     space.initialize();
     spaces.push(space);

     // @TODO: emit event

     // @TODO: Do we need to return the address of the new space
     // or the whole contract?
     return address(space);
   }

    function getVersion() public virtual view returns (string memory) {
      return version;
    }
  }