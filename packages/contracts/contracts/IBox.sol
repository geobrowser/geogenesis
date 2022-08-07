// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

struct BoxParameters {
    address contractAddress;
    uint256 tokenId;
}

interface IBox {
    event SetBoxParameters(BoxParameters parameters, uint256 indexed id);

    function boxParameters(uint256 boxId)
        external
        view
        returns (BoxParameters memory);

    function setBoxParameters(uint256 boxId, BoxParameters calldata parameters)
        external;
}
