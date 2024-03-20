// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

// The ID of the permission required to approve proposals.
bytes32 constant EDITOR_PERMISSION_ID = keccak256("EDITOR_PERMISSION");

// The ID of the permission to emit content events
bytes32 constant CONTENT_PERMISSION_ID = keccak256("CONTENT_PERMISSION");

// The ID of the permission to accept a space as a subspace
bytes32 constant SUBSPACE_PERMISSION_ID = keccak256("SUBSPACE_PERMISSION");
