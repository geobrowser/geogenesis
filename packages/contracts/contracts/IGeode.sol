// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import './IBox.sol';
import './IBoxVersionable.sol';

interface IGeode is IERC721, IBox, IBoxVersionable {}
