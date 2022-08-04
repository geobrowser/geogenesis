// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/utils/Strings.sol';

contract GeoDocument is ERC721, ReentrancyGuard, Ownable {
    using Counters for Counters.Counter;

    using Strings for uint256;

    constructor(string memory customBaseURI_) ERC721('GeoDocument', 'GEODE') {
        customBaseURI = customBaseURI_;
    }

    function originalSender() private view returns (address) {
        // HACK: tx.origin isn't safe. Can we make the contract the operator?
        return tx.origin;
    }

    /** TOKEN PARAMETERS **/

    struct TokenParameters {
        string cid;
        uint256 parentId;
    }

    mapping(uint256 => TokenParameters) private tokenParametersMap;

    function tokenParameters(uint256 tokenId)
        external
        view
        returns (TokenParameters memory)
    {
        return tokenParametersMap[tokenId];
    }

    /** MINTING **/

    Counters.Counter private supplyCounter = Counters.Counter(1);

    function mint(TokenParameters calldata parameters)
        public
        nonReentrant
        returns (uint256)
    {
        uint256 id = totalSupply();

        _mint(originalSender(), id);

        tokenParametersMap[id] = parameters;

        supplyCounter.increment();

        return id;
    }

    function totalSupply() public view returns (uint256) {
        return supplyCounter.current();
    }

    /** URI HANDLING **/

    string private customBaseURI;

    function setBaseURI(string memory customBaseURI_) external onlyOwner {
        customBaseURI = customBaseURI_;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return customBaseURI;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        TokenParameters memory parameters = tokenParametersMap[tokenId];

        return (
            string(
                abi.encodePacked(
                    super.tokenURI(tokenId),
                    '?',
                    'cid=',
                    parameters.cid,
                    '&',
                    'parentId=',
                    parameters.parentId.toString()
                )
            )
        );
    }
}
