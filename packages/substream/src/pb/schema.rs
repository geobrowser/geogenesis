// @generated
// *
// We currently index two sets of contracts representing spaces:
// 1. The original Space contract with simple permissions rules and no proposals.
// 2. The new (as of January 23rd, 2024) DAO-based contracts with Plugins representing
//     the Space and any governance and permissions rules.
//
// Having multiple sets of contracts means that we support multiple methods for
// indexing data from these contracts, including the data representing the contracts
// themselves like the address of the contract and any plugins (if they exist).
//
// We will eventually deprecate the existing contracts and migrate data and permissions
// in them to the new contract implementation. To do this we will likely only index the
// old contracts up to a specific block number and then index the new contracts from that
// block.
//
// Alternatively we might look to "snapshot" the state of Geo at a specific timepoint
// and migrate fully to the new contracts. This would likely coincide with a migration
// to a separate blockchain.
//
// The new, DAO-based contracts are based on Aragon's OSX architecture in which a DAO's
// onchain functionality is defined by a set of plugin contracts. These plugins can be
// used for things like governance, membership, or representing an append-only log of
// IPFS content.

/// *
/// Entries represent the content being added to a legacy space (See top level for more
/// info on the different space contracts). This content is stored on IPFS and represented
/// by a content URI.
///
/// Additionally we map the author of the content and the space the content was added to.
///
/// The new, DAO-based contracts have a different method and event for adding content to
/// a space which will get mapped in a separate event.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EntryAdded {
    /// {block-number}-{tx-hash}-{log-index}
    #[prost(string, tag="1")]
    pub id: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub index: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub uri: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub author: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub space: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EntriesAdded {
    #[prost(message, repeated, tag="1")]
    pub entries: ::prost::alloc::vec::Vec<EntryAdded>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RoleChange {
    #[prost(oneof="role_change::Change", tags="1, 2")]
    pub change: ::core::option::Option<role_change::Change>,
}
/// Nested message and enum types in `RoleChange`.
pub mod role_change {
    #[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Change {
        #[prost(message, tag="1")]
        Granted(super::RoleGranted),
        #[prost(message, tag="2")]
        Revoked(super::RoleRevoked),
    }
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RoleChanges {
    #[prost(message, repeated, tag="1")]
    pub changes: ::prost::alloc::vec::Vec<RoleChange>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RoleGranted {
    #[prost(string, tag="1")]
    pub id: ::prost::alloc::string::String,
    #[prost(enumeration="Role", tag="2")]
    pub role: i32,
    #[prost(string, tag="3")]
    pub account: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub sender: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub space: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RolesGranted {
    #[prost(message, repeated, tag="1")]
    pub roles: ::prost::alloc::vec::Vec<RoleGranted>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RoleRevoked {
    #[prost(string, tag="1")]
    pub id: ::prost::alloc::string::String,
    #[prost(enumeration="Role", tag="2")]
    pub role: i32,
    #[prost(string, tag="3")]
    pub account: ::prost::alloc::string::String,
    #[prost(string, tag="4")]
    pub sender: ::prost::alloc::string::String,
    #[prost(string, tag="5")]
    pub space: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RolesRevoked {
    #[prost(message, repeated, tag="1")]
    pub roles: ::prost::alloc::vec::Vec<RoleRevoked>,
}
/// *
/// Profiles represent the users of Geo. Profiles are registered in the GeoProfileRegistry
/// contract and are associated with a user's EVM-based address and the space where metadata
/// representing their profile resides in.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoProfileRegistered {
    #[prost(string, tag="1")]
    pub requestor: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub space: ::prost::alloc::string::String,
    #[prost(string, tag="3")]
    pub id: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoProfilesRegistered {
    #[prost(message, repeated, tag="1")]
    pub profiles: ::prost::alloc::vec::Vec<GeoProfileRegistered>,
}
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
/// *
/// An editor has editing and voting permissions in a DAO-based space. Editors join a space
/// one of two ways:
/// 1. They submit a request to join the space as an editor which goes to a vote. The editors
///     in the space vote on whether to accept the new editor.
/// 2. They are added as a set of initial editors when first creating the space. This allows
///     space deployers to bootstrap a set of editors on space creation.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EditorAdded {
    /// The event emits an array of addresses. We only emit multiple addresses
    /// when first creating the governance plugin. After that we only emit one
    /// address at a time via proposals.
    #[prost(string, repeated, tag="1")]
    pub addresses: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct EditorsAdded {
    #[prost(message, repeated, tag="1")]
    pub members: ::prost::alloc::vec::Vec<EditorAdded>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GeoOutput {
    #[prost(message, repeated, tag="1")]
    pub entries: ::prost::alloc::vec::Vec<EntryAdded>,
    #[prost(message, repeated, tag="2")]
    pub role_changes: ::prost::alloc::vec::Vec<RoleChange>,
    #[prost(message, repeated, tag="3")]
    pub profiles_registered: ::prost::alloc::vec::Vec<GeoProfileRegistered>,
    #[prost(message, repeated, tag="4")]
    pub spaces_created: ::prost::alloc::vec::Vec<GeoSpaceCreated>,
    #[prost(message, repeated, tag="5")]
    pub governance_plugins_created: ::prost::alloc::vec::Vec<GeoGovernancePluginCreated>,
    /// repeated SuccessorSpaceCreated successor_spaces_created = 6;
    #[prost(message, repeated, tag="6")]
    pub editors_added: ::prost::alloc::vec::Vec<EditorAdded>,
}
/// *
/// Roles represent the permissions for a legacy space (See top level comment for more info
/// on the different space contracts). Roles fall into "admin", "editor controller" (moderator),
/// and "editor" (member) roles, each granting different permissions within the space.
///
/// The new, DAO-based contracts have a different, but similar permissions model that omits the 
/// moderator role.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, ::prost::Enumeration)]
#[repr(i32)]
pub enum Role {
    NullRole = 0,
    Moderator = 1,
    Member = 2,
    Admin = 3,
}
impl Role {
    /// String value of the enum field names used in the ProtoBuf definition.
    ///
    /// The values are not transformed in any way and thus are considered stable
    /// (if the ProtoBuf definition does not change) and safe for programmatic use.
    pub fn as_str_name(&self) -> &'static str {
        match self {
            Role::NullRole => "NULL_ROLE",
            Role::Moderator => "MODERATOR",
            Role::Member => "MEMBER",
            Role::Admin => "ADMIN",
        }
    }
    /// Creates an enum from field names used in the ProtoBuf definition.
    pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
        match value {
            "NULL_ROLE" => Some(Self::NullRole),
            "MODERATOR" => Some(Self::Moderator),
            "MEMBER" => Some(Self::Member),
            "ADMIN" => Some(Self::Admin),
            _ => None,
        }
    }
}
// @@protoc_insertion_point(module)
