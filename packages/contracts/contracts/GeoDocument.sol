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

    /** TOKEN PARAMETERS **/

    struct TokenParameters {
        string contentHash;
        uint256 previousVersionId;
        uint256 nextVersionId;
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

    Counters.Counter private supplyCounter;

    function mint(TokenParameters calldata parameters) public nonReentrant {
        require(saleIsActive, 'Sale not active');

        uint256 id = totalSupply();

        _mint(msg.sender, id);

        tokenParametersMap[id] = parameters;

        supplyCounter.increment();
    }

    function totalSupply() public view returns (uint256) {
        return supplyCounter.current();
    }

    /** ACTIVATION **/

    bool public saleIsActive = true;

    function setSaleIsActive(bool saleIsActive_) external onlyOwner {
        saleIsActive = saleIsActive_;
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
                    'contentHash=',
                    parameters.contentHash,
                    '&',
                    'previousVersionId=',
                    parameters.previousVersionId.toString(),
                    '&',
                    'nextVersionId=',
                    parameters.nextVersionId.toString()
                )
            )
        );
    }
}
