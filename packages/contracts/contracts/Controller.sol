// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import './Geode.sol';
import './Proposal.sol';
import './GeoDocument.sol';

contract Controller is ReentrancyGuard {
    using Strings for uint256;

    GeoDocument documentContract;
    Geode geodeContract;
    Proposal proposalContract;

    constructor(
        address geodeContractAddress,
        address proposalContractAddress,
        address documentContractAddress
    ) {
        geodeContract = Geode(geodeContractAddress);
        proposalContract = Proposal(proposalContractAddress);
        documentContract = GeoDocument(documentContractAddress);
    }

    /** GEODES **/

    function createGeode(uint256 documentId) private returns (uint256) {
        BoxParameters memory box = BoxParameters({
            contractAddress: address(documentContract),
            tokenId: documentId
        });

        return geodeContract.mint(box);
    }

    function updateGeode(uint256 geodeId_, uint256 documentId) private {
        require(
            geodeContract.ownerOf(geodeId_) == msg.sender,
            'Caller must own geode'
        );

        BoxParameters memory box = geodeContract.boxParameters(geodeId_);
        box.tokenId = documentId;
        geodeContract.setBoxParameters(geodeId_, box);
    }

    mapping(uint256 => uint256) public documentToGeodeMap;

    function geodeId(uint256 documentId) public view returns (uint256) {
        return documentToGeodeMap[documentId];
    }

    /** DOCUMENTS **/

    event CreateDocument(uint256 indexed geodeId, uint256 indexed documentId);

    function createDocument(string calldata cid)
        public
        nonReentrant
        returns (uint256)
    {
        // Mint a new GeoDocument token
        uint256 documentId = documentContract.mint(
            GeoDocument.TokenParameters({cid: cid, parentId: 0})
        );

        // Wrap it in a Geode
        uint256 geodeId_ = createGeode(documentId);

        documentToGeodeMap[documentId] = geodeId_;

        emit CreateDocument(geodeId_, documentId);

        return documentId;
    }

    struct RevisionParameters {
        string cid;
        uint256 parentId;
    }

    function createRevision(
        RevisionParameters calldata parameters,
        bool shouldUpdateGeode
    ) public nonReentrant returns (uint256) {
        uint256 revisionId = documentContract.mint(
            GeoDocument.TokenParameters({
                cid: parameters.cid,
                parentId: parameters.parentId
            })
        );

        uint256 geodeId_ = this.geodeId(parameters.parentId);

        documentToGeodeMap[revisionId] = geodeId_;

        if (shouldUpdateGeode) {
            updateGeode(geodeId_, revisionId);
        }

        emit CreateDocument(geodeId_, revisionId);

        return revisionId;
    }

    /** PROPOSALS **/

    function createProposal(RevisionParameters calldata parameters)
        public
        nonReentrant
        returns (uint256)
    {
        uint256 revisionId = createRevision(parameters, false);

        uint256 geodeId_ = geodeId(parameters.parentId);

        Proposal.MintParameters memory proposal = Proposal.MintParameters({
            target: BoxParameters({
                contractAddress: address(geodeContract),
                tokenId: geodeId_
            }),
            proposed: BoxParameters({
                contractAddress: address(documentContract),
                tokenId: revisionId
            })
        });

        return proposalContract.mint(proposal);
    }

    function mergeProposal(uint256 proposalId) public nonReentrant {
        proposalContract.merge(proposalId);
    }

    function documentIdForProposalId(uint256 proposalId)
        private
        view
        returns (uint256)
    {
        return proposalContract.proposalParameters(proposalId).proposed.tokenId;
    }

    function createRevisionIfNeeded(
        uint256 proposalId,
        RevisionParameters calldata parameters
    ) private returns (uint256) {
        uint256 currentDocumentId = documentIdForProposalId(proposalId);
        string memory updatedCID = parameters.cid;

        if (
            isEqual(
                documentContract.tokenParameters(currentDocumentId).cid,
                updatedCID
            )
        ) {
            return currentDocumentId;
        } else {
            return createRevision(parameters, false);
        }
    }

    function rebaseAndMergeProposal(
        uint256 proposalId,
        RevisionParameters calldata parameters
    ) public nonReentrant {
        BoxParameters memory box = BoxParameters({
            contractAddress: address(documentContract),
            tokenId: createRevisionIfNeeded(proposalId, parameters)
        });

        proposalContract.rebaseAndMerge(proposalId, box);
    }

    /** UTILS **/

    function isEqual(string memory a, string memory b)
        private
        pure
        returns (bool)
    {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
    }
}
