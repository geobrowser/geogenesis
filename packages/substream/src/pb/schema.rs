// @generated
/// *
/// The new DAO-based contracts allow forking of spaces into successor spaces. This is so
/// users can create new spaces whose data is derived from another space.
///
/// This is immediately useful when migrating from legacy spaces to the new DAO-based spaces,
/// but it's generally applicable across any space.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SuccessorSpaceCreated {
    #[prost(string, tag="1")]
    pub predecessor_space: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub dao_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SuccessorSpacesCreated {
    #[prost(message, repeated, tag="1")]
    pub spaces: ::prost::alloc::vec::Vec<SuccessorSpaceCreated>,
}
/// *
/// The new DAO-based space contracts are based on Aragon's OSX architecture which uses
/// plugins to define functionality assigned to a DAO (See the top level comment for more
/// information on Aragon's DAO architecture).
///
/// This event maps creation of the Space plugin and associates the Space plugin contract
/// address with the address of the DAO contract.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoSpaceCreated {
    #[prost(string, tag="1")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub space_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoSpacesCreated {
    #[prost(message, repeated, tag="1")]
    pub spaces: ::prost::alloc::vec::Vec<GeoSpaceCreated>,
}
/// *
/// The new DAO-based space contracts are based on Aragon's OSX architecture which uses
/// plugins to define functionality assigned to a DAO (See the top level comment for more
/// information on Aragon's DAO architecture).
///
/// This event maps creation of any governance plugins and associates the governance plugins
/// contract addresses with the address of the DAO contract.
///
/// As of January 23, 2024 there are two governance plugins:
/// 1. Voting plugin – This defines the voting and proposal rules and behaviors for a DAO
/// 2. Member access plugin – This defines the membership rules and behaviors for a DAO
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoGovernancePluginCreated {
    #[prost(string, tag="1")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub main_voting_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub member_access_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoGovernancePluginsCreated {
    #[prost(message, repeated, tag="1")]
    pub plugins: ::prost::alloc::vec::Vec<GeoGovernancePluginCreated>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoPersonalSpaceAdminPluginCreated {
    #[prost(string, tag="1")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub personal_admin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub initial_editor: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoPersonalSpaceAdminPluginsCreated {
    #[prost(message, repeated, tag="1")]
    pub plugins: ::prost::alloc::vec::Vec<GeoPersonalSpaceAdminPluginCreated>,
}
/// *
/// This event represents adding editors to a DAO-based space
///
/// The data model for DAO-based spaces works slightly differently than in legacy spaces.
/// This means there will be a period where we need to support both data models depending
/// on which space/contract we are working with. Eventually these data models will be merged
/// and usage of the legacy space contracts will be migrated to the DAO-based contracts, but
/// for now we are appending "V2" to permissions data models to denote it's used for the
/// DAO-based spaces.
///
/// An editor has editing and voting permissions in a DAO-based space. Editors join a space
/// one of two ways:
/// 1. They submit a request to join the space as an editor which goes to a vote. The editors
///     in the space vote on whether to accept the new editor.
/// 2. They are added as a set of initial editors when first creating the space. This allows
///     space deployers to bootstrap a set of editors on space creation.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct InitialEditorAdded {
    /// The event emits an array of addresses. We only emit multiple addresses
    /// when first creating the governance plugin. After that we only emit one
    /// address at a time via proposals.
    #[prost(string, repeated, tag="1")]
    pub addresses: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
    #[prost(string, tag="2")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub dao_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct InitialEditorsAdded {
    #[prost(message, repeated, tag="1")]
    pub editors: ::prost::alloc::vec::Vec<InitialEditorAdded>,
}
/// Executed proposals have been approved and executed onchain in a DAO-based
/// space's main voting plugin. The DAO itself also emits the executed event,
/// but the ABI/interface is different. We really only care about the one
/// from our plugins.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ProposalExecuted {
    #[prost(string, tag="1")]
    pub proposal_id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub plugin_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ProposalsExecuted {
    #[prost(message, repeated, tag="1")]
    pub executed_proposals: ::prost::alloc::vec::Vec<ProposalExecuted>,
}
/// *
/// Processed Proposals represent content that has been approved by a DAO
/// and executed onchain.
///
/// We use the content URI to represent the content that was approved. We
/// only consume the `proposalId` in the content URI to map the processed
/// data to an existing proposal onchain and in the sink.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EditPublished {
    #[prost(string, tag="1")]
    pub content_uri: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub dao_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EditsPublished {
    #[prost(message, repeated, tag="1")]
    pub edits: ::prost::alloc::vec::Vec<EditPublished>,
}
/// *
/// Added or Removed Subspaces represent adding a space contracto to the hierarchy
/// of the DAO-based space. This is useful to "link" Spaces together in a
/// tree of spaces, allowing us to curate the graph of their knowledge and
/// permissions.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SubspaceAdded {
    #[prost(string, tag="1")]
    pub subspace: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub change_type: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub dao_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SubspacesAdded {
    #[prost(message, repeated, tag="1")]
    pub subspaces: ::prost::alloc::vec::Vec<SubspaceAdded>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SubspaceRemoved {
    #[prost(string, tag="1")]
    pub subspace: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub change_type: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub dao_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SubspacesRemoved {
    #[prost(message, repeated, tag="1")]
    pub subspaces: ::prost::alloc::vec::Vec<SubspaceRemoved>,
}
/// *
/// Votes represent a vote on a proposal in a DAO-based space.
///
/// Currently we use a simple majority voting model, where a proposal requires 51% of the
/// available votes in order to pass. Only editors are allowed to vote on proposals, but editors
/// _and_ members can create them.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct VoteCast {
    #[prost(string, tag="1")]
    pub onchain_proposal_id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub voter: ::prost::alloc::string::String,
    #[prost(uint64, tag="3")]
    pub vote_option: u64,
    #[prost(string, tag="4")]
    pub plugin_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct VotesCast {
    #[prost(message, repeated, tag="1")]
    pub votes: ::prost::alloc::vec::Vec<VoteCast>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct MemberAdded {
    #[prost(string, tag="1")]
    pub member_address: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub main_voting_plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub change_type: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub dao_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct MembersAdded {
    #[prost(message, repeated, tag="1")]
    pub members: ::prost::alloc::vec::Vec<MemberAdded>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct MemberRemoved {
    #[prost(string, tag="1")]
    pub member_address: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub change_type: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub dao_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct MembersRemoved {
    #[prost(message, repeated, tag="1")]
    pub members: ::prost::alloc::vec::Vec<MemberRemoved>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EditorAdded {
    #[prost(string, tag="1")]
    pub editor_address: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub main_voting_plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub change_type: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub dao_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EditorsAdded {
    #[prost(message, repeated, tag="1")]
    pub editors: ::prost::alloc::vec::Vec<EditorAdded>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EditorRemoved {
    #[prost(string, tag="1")]
    pub editor_address: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub change_type: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub dao_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EditorsRemoved {
    #[prost(message, repeated, tag="1")]
    pub editors: ::prost::alloc::vec::Vec<EditorRemoved>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct PublishEditProposalCreated {
    #[prost(string, tag="1")]
    pub proposal_id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub creator: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub start_time: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub end_time: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub content_uri: ::prost::alloc::string::String,
    #[prost(string, tag="6")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="7")]
    pub plugin_address: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct PublishEditsProposalsCreated {
    #[prost(message, repeated, tag="1")]
    pub edits: ::prost::alloc::vec::Vec<PublishEditProposalCreated>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AddMemberProposalCreated {
    #[prost(string, tag="1")]
    pub proposal_id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub creator: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub start_time: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub end_time: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub member: ::prost::alloc::string::String,
    #[prost(string, tag="6")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="7")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="8")]
    pub change_type: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AddMemberProposalsCreated {
    #[prost(message, repeated, tag="1")]
    pub proposed_members: ::prost::alloc::vec::Vec<AddMemberProposalCreated>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RemoveMemberProposalCreated {
    #[prost(string, tag="1")]
    pub proposal_id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub creator: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub start_time: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub end_time: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub member: ::prost::alloc::string::String,
    #[prost(string, tag="6")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="7")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="8")]
    pub change_type: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RemoveMemberProposalsCreated {
    #[prost(message, repeated, tag="1")]
    pub proposed_members: ::prost::alloc::vec::Vec<RemoveMemberProposalCreated>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AddEditorProposalCreated {
    #[prost(string, tag="1")]
    pub proposal_id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub creator: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub start_time: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub end_time: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub editor: ::prost::alloc::string::String,
    #[prost(string, tag="6")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="7")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="8")]
    pub change_type: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AddEditorProposalsCreated {
    #[prost(message, repeated, tag="1")]
    pub proposed_editors: ::prost::alloc::vec::Vec<AddEditorProposalCreated>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RemoveEditorProposalCreated {
    #[prost(string, tag="1")]
    pub proposal_id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub creator: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub start_time: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub end_time: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub editor: ::prost::alloc::string::String,
    #[prost(string, tag="6")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="7")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="8")]
    pub change_type: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RemoveEditorProposalsCreated {
    #[prost(message, repeated, tag="1")]
    pub proposed_editors: ::prost::alloc::vec::Vec<RemoveEditorProposalCreated>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AddSubspaceProposalCreated {
    #[prost(string, tag="1")]
    pub proposal_id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub creator: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub start_time: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub end_time: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub subspace: ::prost::alloc::string::String,
    #[prost(string, tag="6")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="7")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="8")]
    pub change_type: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AddSubspaceProposalsCreated {
    #[prost(message, repeated, tag="1")]
    pub proposed_subspaces: ::prost::alloc::vec::Vec<AddSubspaceProposalCreated>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RemoveSubspaceProposalCreated {
    #[prost(string, tag="1")]
    pub proposal_id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub creator: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub start_time: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub end_time: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub subspace: ::prost::alloc::string::String,
    #[prost(string, tag="6")]
    pub dao_address: ::prost::alloc::string::String,
    #[prost(string, tag="7")]
    pub plugin_address: ::prost::alloc::string::String,
    #[prost(string, tag="8")]
    pub change_type: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RemoveSubspaceProposalsCreated {
    #[prost(message, repeated, tag="1")]
    pub proposed_subspaces: ::prost::alloc::vec::Vec<RemoveSubspaceProposalCreated>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoOutput {
    #[prost(message, repeated, tag="1")]
    pub spaces_created: ::prost::alloc::vec::Vec<GeoSpaceCreated>,
    #[prost(message, repeated, tag="2")]
    pub governance_plugins_created: ::prost::alloc::vec::Vec<GeoGovernancePluginCreated>,
    #[prost(message, repeated, tag="3")]
    pub initial_editors_added: ::prost::alloc::vec::Vec<InitialEditorAdded>,
    #[prost(message, repeated, tag="4")]
    pub votes_cast: ::prost::alloc::vec::Vec<VoteCast>,
    #[prost(message, repeated, tag="5")]
    pub edits_published: ::prost::alloc::vec::Vec<EditPublished>,
    #[prost(message, repeated, tag="6")]
    pub successor_spaces_created: ::prost::alloc::vec::Vec<SuccessorSpaceCreated>,
    #[prost(message, repeated, tag="7")]
    pub subspaces_added: ::prost::alloc::vec::Vec<SubspaceAdded>,
    #[prost(message, repeated, tag="8")]
    pub subspaces_removed: ::prost::alloc::vec::Vec<SubspaceRemoved>,
    #[prost(message, repeated, tag="9")]
    pub executed_proposals: ::prost::alloc::vec::Vec<ProposalExecuted>,
    #[prost(message, repeated, tag="10")]
    pub members_added: ::prost::alloc::vec::Vec<MemberAdded>,
    #[prost(message, repeated, tag="11")]
    pub editors_added: ::prost::alloc::vec::Vec<EditorAdded>,
    #[prost(message, repeated, tag="12")]
    pub personal_plugins_created: ::prost::alloc::vec::Vec<GeoPersonalSpaceAdminPluginCreated>,
    #[prost(message, repeated, tag="13")]
    pub members_removed: ::prost::alloc::vec::Vec<MemberRemoved>,
    #[prost(message, repeated, tag="14")]
    pub editors_removed: ::prost::alloc::vec::Vec<EditorRemoved>,
    #[prost(message, repeated, tag="15")]
    pub edits: ::prost::alloc::vec::Vec<PublishEditProposalCreated>,
    #[prost(message, repeated, tag="16")]
    pub proposed_added_members: ::prost::alloc::vec::Vec<AddMemberProposalCreated>,
    #[prost(message, repeated, tag="17")]
    pub proposed_removed_members: ::prost::alloc::vec::Vec<RemoveMemberProposalCreated>,
    #[prost(message, repeated, tag="18")]
    pub proposed_added_editors: ::prost::alloc::vec::Vec<AddEditorProposalCreated>,
    #[prost(message, repeated, tag="19")]
    pub proposed_removed_editors: ::prost::alloc::vec::Vec<RemoveEditorProposalCreated>,
    #[prost(message, repeated, tag="20")]
    pub proposed_added_subspaces: ::prost::alloc::vec::Vec<AddSubspaceProposalCreated>,
    #[prost(message, repeated, tag="21")]
    pub proposed_removed_subspaces: ::prost::alloc::vec::Vec<RemoveSubspaceProposalCreated>,
}
// @@protoc_insertion_point(module)
