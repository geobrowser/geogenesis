//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.14;

import "./Space.sol";
import "./ISpaceFactory.sol";

// @TODO: How do we handle newer implementations of Space?
contract SpaceFactory is ISpaceFactory {
   Space[] public spaces;

  /**
    Q: Do we need to rate-limit this somehow?
  */
   function createSpace() public returns (address newSpace) {
    // @TODO: Every one of these needs to a BeaconProxy that points
    // to the PERMISSIONED_SPACE_BEACON_ADDRESS
     Space space = new Space();
     
     emit SelfAddress(address(this));
     emit OriginalOwner(space.owner());
    //  space.transferOwnership(address(this));
    //  space.configureRoles();
    //  spaces.push(space);

     // @TODO: emit event

     // @TODO: Do we need to return the address of the new space
     // or the whole contract?
     return address(this);
   }

    function version() public pure returns (string memory) {
      return "0.0.1";
    }
  }