// @generated
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
pub struct GeoOutput {
    #[prost(message, repeated, tag="1")]
    pub entries: ::prost::alloc::vec::Vec<EntryAdded>,
    #[prost(message, repeated, tag="2")]
    pub role_changes: ::prost::alloc::vec::Vec<RoleChange>,
    #[prost(message, repeated, tag="3")]
    pub profiles_registered: ::prost::alloc::vec::Vec<GeoProfileRegistered>,
    /// repeated SuccessorSpaceCreated successor_spaces_created = 4;
    #[prost(message, repeated, tag="5")]
    pub spaces_created: ::prost::alloc::vec::Vec<GeoSpaceCreated>,
    #[prost(message, repeated, tag="6")]
    pub governance_plugins_created: ::prost::alloc::vec::Vec<GeoGovernancePluginCreated>,
}
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
