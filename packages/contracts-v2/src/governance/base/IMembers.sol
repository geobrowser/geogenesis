// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

/// @title IMembers
/// @author Aragon X - 2024
/// @notice An interface to be implemented by DAO plugins that define membership.
interface IMembers {
    /// @notice Emitted when a member is added to the DAO plugin.
    /// @param member The address of the new member being added.
    event MemberAdded(address member);

    /// @notice Emitted when member is removed from the DAO plugin.
    /// @param member The address of the existing member being removed.
    event MemberRemoved(address member);

    /// @notice Checks if an account is a member.
    /// @param _account The address of the account to be checked.
    /// @return Whether the account is a member or not.
    function isMember(address _account) external view returns (bool);
}
