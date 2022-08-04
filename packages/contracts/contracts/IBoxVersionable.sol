// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import './IBox.sol';

interface IBoxVersionable {
    function versionCount(uint256 tokenId) external view returns (uint256);

    function versionByIndex(uint256 tokenId, uint256 index)
        external
        view
        returns (BoxParameters memory);
}
