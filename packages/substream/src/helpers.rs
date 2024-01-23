use substreams::{hex, Hex};

use crate::{
    legacy_space::events::{RoleGranted as RoleGrantedEvent, RoleRevoked as RoleRevokedEvent},
    pb::schema::{role_change::Change, RoleChange, RoleGranted, RoleRevoked},
};

const ADMIN_ROLE: [u8; 32] =
    hex!("a49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775");

const EDITOR_CONTROLLER_ROLE: [u8; 32] =
    hex!("bc2c04b16435c5f4eaa37fec9ad808fec563d665b1febf40775380f3f1b592b4");

const EDITOR_ROLE: [u8; 32] =
    hex!("21d1167972f621f75904fb065136bc8b53c7ba1c60ccd3a7758fbee465851e9c");

/// This function will return the hex representation of the address in lowercase
pub fn format_hex(address: &[u8]) -> String {
    format!("0x{}", Hex(address).to_string())
}

pub fn role_to_enum_value(role: [u8; 32]) -> i32 {
    match role {
        EDITOR_CONTROLLER_ROLE => 1,
        EDITOR_ROLE => 2,
        ADMIN_ROLE => 3,
        _ => 0,
    }
}

pub enum ChangeKind {
    Granted(RoleGrantedEvent),
    Revoked(RoleRevokedEvent),
}

impl ChangeKind {
    fn role(&self) -> i32 {
        let role = match self {
            ChangeKind::Granted(r) => r.role,
            ChangeKind::Revoked(r) => r.role,
        };

        role_to_enum_value(role)
    }

    fn sender(&self) -> String {
        let sender = match self {
            ChangeKind::Granted(r) => &r.sender,
            ChangeKind::Revoked(r) => &r.sender,
        };

        format_hex(&sender)
    }

    fn account(&self) -> String {
        let account = match self {
            ChangeKind::Granted(r) => &r.account,
            ChangeKind::Revoked(r) => &r.account,
        };

        format_hex(&account)
    }

    pub fn as_change(&self, id: String, space: String) -> RoleChange {
        let change = match self {
            ChangeKind::Granted(_) => {
                let role = self.role();
                let sender = self.sender();
                let account = self.account();
                Change::Granted(RoleGranted {
                    id,
                    role,
                    sender,
                    account,
                    space,
                })
            }
            ChangeKind::Revoked(_) => {
                let role = self.role();
                let sender = self.sender();
                let account = self.account();
                Change::Revoked(RoleRevoked {
                    id,
                    role,
                    sender,
                    account,
                    space,
                })
            }
        };

        RoleChange {
            change: Some(change),
        }
    }
}
