// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/utils/Strings.sol';

import './IBox.sol';
import './IBoxVersionable.sol';

contract Proposal is ERC721, ReentrancyGuard, Ownable {
    using Counters for Counters.Counter;

    using Strings for uint256;
    using Strings for address;

    constructor(string memory customBaseURI_) ERC721('Proposal', 'PRO') {
        customBaseURI = customBaseURI_;
    }

    function originalSender() private view returns (address) {
        // HACK: tx.origin isn't safe. Can we make the contract the operator?
        return tx.origin;
    }

    /** MODIFIERS **/

    modifier onlyProposalOrTargetOwner(uint256 proposalId) {
        _checkTokenOrTargetOwner(proposalId);
        _;
    }

    modifier onlyTargetOwner(uint256 proposalId) {
        _checkTargetOwner(proposalId);
        _;
    }

    function _checkTokenOrTargetOwner(uint256 proposalId) internal view {
        require(
            ownerOf(proposalId) == originalSender() ||
                ownerOfTarget(proposalId) == originalSender(),
            'Proposal: caller must own proposal or box'
        );
    }

    function _checkTargetOwner(uint256 proposalId) internal view {
        require(
            ownerOfTarget(proposalId) == originalSender(),
            'Proposal: caller must own box'
        );
    }

    function ownerOfTarget(uint256 proposalId) public view returns (address) {
        ProposalParameters memory parameters = proposalParameters(proposalId);
        IERC721 targetContract = IERC721(parameters.target.contractAddress);
        return targetContract.ownerOf(parameters.target.tokenId);
    }

    /** PARAMETERS **/

    struct ProposalParameters {
        // The target box this proposal will update
        BoxParameters target;
        // The version of the target box at the time the proposal was made
        uint256 targetVersion;
        // The proposed box parameters to be assigned to the target
        BoxParameters proposed;
    }

    mapping(uint256 => ProposalParameters) private proposalParametersMap;

    function proposalParameters(uint256 proposalId)
        public
        view
        returns (ProposalParameters memory)
    {
        return proposalParametersMap[proposalId];
    }

    /** BOX **/

    function boxVersion(BoxParameters memory target)
        private
        view
        returns (uint256)
    {
        IBoxVersionable versionable = IBoxVersionable(target.contractAddress);

        return versionable.versionCount(target.tokenId) - 1;
    }

    /** MINTING **/

    Counters.Counter private mintCounter = Counters.Counter(1);

    struct MintParameters {
        BoxParameters target;
        BoxParameters proposed;
    }

    function mint(MintParameters calldata parameters)
        public
        nonReentrant
        returns (uint256)
    {
        uint256 id = mintCounter.current();

        // Mint a new Proposal token
        _mint(originalSender(), id);

        proposalParametersMap[id] = ProposalParameters({
            target: parameters.target,
            proposed: parameters.proposed,
            targetVersion: boxVersion(parameters.target)
        });

        mintCounter.increment();

        return id;
    }

    /** OPERATIONS **/

    function merge(uint256 proposalId)
        public
        nonReentrant
        onlyTargetOwner(proposalId)
    {
        Proposal.ProposalParameters memory parameters = proposalParameters(
            proposalId
        );

        require(
            parameters.targetVersion == boxVersion(parameters.target),
            'Target version must match proposal'
        );

        IBox boxContract = IBox(parameters.target.contractAddress);

        // Update the geode
        boxContract.setBoxParameters(
            parameters.target.tokenId,
            parameters.proposed
        );

        // Burn the proposal
        burn(proposalId);
    }

    function rebase(uint256 proposalId)
        public
        nonReentrant
        onlyProposalOrTargetOwner(proposalId)
    {
        proposalParametersMap[proposalId].targetVersion = boxVersion(
            proposalParametersMap[proposalId].target
        );
    }

    function update(uint256 proposalId, BoxParameters calldata proposed)
        public
        nonReentrant
        onlyProposalOrTargetOwner(proposalId)
    {
        proposalParametersMap[proposalId].proposed = proposed;
    }

    function burn(uint256 proposalId)
        public
        onlyProposalOrTargetOwner(proposalId)
    {
        _burn(proposalId);
    }

    function rebaseAndMerge(uint256 proposalId)
        public
        nonReentrant
        onlyProposalOrTargetOwner(proposalId)
    {
        rebase(proposalId);
        merge(proposalId);
    }

    function rebaseAndMerge(uint256 proposalId, BoxParameters calldata proposed)
        public
        nonReentrant
        onlyProposalOrTargetOwner(proposalId)
    {
        update(proposalId, proposed);
        rebaseAndMerge(proposalId);
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
        ProposalParameters memory parameters = proposalParametersMap[tokenId];

        return (
            string(
                abi.encodePacked(
                    super.tokenURI(tokenId),
                    '?',
                    'targetContract=',
                    parameters.target.contractAddress.toHexString(),
                    '&',
                    'targetTokenId=',
                    parameters.target.tokenId.toString(),
                    '&',
                    'targetVersion=',
                    parameters.targetVersion.toString(),
                    '&',
                    'proposedContract=',
                    parameters.proposed.contractAddress.toHexString(),
                    '&',
                    'proposedTokenId=',
                    parameters.proposed.tokenId.toString()
                )
            )
        );
    }
}
