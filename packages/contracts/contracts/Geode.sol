// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import './IGeode.sol';

contract Geode is ERC721, IGeode, ReentrancyGuard, Ownable {
    using Counters for Counters.Counter;

    using Strings for uint256;

    constructor() ERC721('Geode', 'GEODE') {}

    function originalSender() private view returns (address) {
        // HACK: tx.origin isn't safe. Can we make the contract the operator?
        return tx.origin;
    }

    /** MINTING **/

    Counters.Counter private mintCounter = Counters.Counter(1);

    function mint(BoxParameters calldata parameters)
        public
        nonReentrant
        returns (uint256)
    {
        uint256 id = mintCounter.current();

        _mint(originalSender(), id);

        versionMap[id].push(parameters);

        mintCounter.increment();

        emit SetBoxParameters(parameters, id);

        return id;
    }

    function totalSupply() public view returns (uint256) {
        return mintCounter.current() - 1;
    }

    /** BOX **/

    function boxParameters(uint256 boxId)
        public
        view
        returns (BoxParameters memory)
    {
        BoxParameters[] memory versions = versionMap[boxId];

        return versions[versions.length - 1];
    }

    function setBoxParameters(uint256 boxId, BoxParameters calldata parameters)
        public
        nonReentrant
    {
        require(ownerOf(boxId) == originalSender(), 'Token not owned');

        versionMap[boxId].push(parameters);

        emit SetBoxParameters(parameters, boxId);
    }

    /** VERSIONS **/

    mapping(uint256 => BoxParameters[]) private versionMap;

    function versionCount(uint256 tokenId) public view returns (uint256) {
        return versionMap[tokenId].length;
    }

    function versionByIndex(uint256 tokenId, uint256 index)
        public
        view
        returns (BoxParameters memory)
    {
        return versionMap[tokenId][index];
    }

    /** URI HANDLING **/

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        BoxParameters memory parameters = boxParameters(tokenId);
        IERC721Metadata targetContract = IERC721Metadata(
            parameters.contractAddress
        );
        return targetContract.tokenURI(parameters.tokenId);
    }

    /** INTERFACES */

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, IERC165)
        returns (bool)
    {
        return (interfaceId == type(IGeode).interfaceId ||
            interfaceId == type(IBoxVersionable).interfaceId ||
            interfaceId == type(IBox).interfaceId ||
            super.supportsInterface(interfaceId));
    }
}
