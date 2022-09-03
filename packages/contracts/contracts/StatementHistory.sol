// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/utils/Strings.sol';

contract StatementHistory is ReentrancyGuard, Ownable {
    event StatementAdded(uint256 index, string uri, address author);

    struct Statement {
        string uri;
        address author;
    }

    Statement[] history;

    function addStatement(string calldata uri) public {
        Statement memory statement = Statement({uri: uri, author: msg.sender});

        uint256 index = history.length;

        history.push(statement);

        emit StatementAdded(index, uri, msg.sender);
    }

    function totalStatements() public view returns (uint256) {
        return history.length;
    }

    function statementAtIndex(uint256 index)
        public
        view
        returns (Statement memory)
    {
        return history[index];
    }
}
