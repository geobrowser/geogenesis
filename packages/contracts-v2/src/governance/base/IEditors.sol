// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

/// @title IEditors
/// @author Aragon X - 2024
interface IEditors {
    /// @notice Emitted when an editors are added to the DAO plugin.
    /// @param editors The addresses of the new editors.
    event EditorsAdded(address[] editors);

    /// @notice Emitted when an editor is added to the DAO plugin.
    /// @param editor The address of the new editor.
    event EditorAdded(address editor);

    /// @notice Emitted when an editor is removed from the DAO plugin.
    /// @param editor The address of the editor being removed.
    event EditorRemoved(address editor);

    /// @notice Checks if an account is an editor on the DAO.
    /// @param _account The address of the account to be checked.
    /// @return Whether the account is an editor or not.
    function isEditor(address _account) external view returns (bool);
}
