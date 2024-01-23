pub mod helpers;
mod pb;

use pb::schema::{
    EntriesAdded, EntryAdded, GeoGovernancePluginCreated, GeoGovernancePluginsCreated, GeoOutput,
    GeoProfileRegistered, GeoProfilesRegistered, GeoSpaceCreated, GeoSpacesCreated, RoleChange,
    RoleChanges, SuccessorSpaceCreated, SuccessorSpacesCreated,
};

use substreams::store::*;
use substreams_ethereum::{pb::eth, use_contract, Event};

use helpers::*;

use_contract!(legacy_space, "abis/legacy-space.json");
use_contract!(space, "abis/space.json");
use_contract!(geo_profile_registry, "abis/geo-profile-registry.json");
use_contract!(space_setup, "abis/space-setup.json");
use_contract!(governance_setup, "abis/governance-setup.json");

use geo_profile_registry::events::GeoProfileRegistered as GeoProfileRegisteredEvent;
use governance_setup::events::GeoGovernancePluginsCreated as GeoGovernancePluginCreatedEvent;
use legacy_space::events::{EntryAdded as EntryAddedEvent, RoleGranted, RoleRevoked};
use space::events::SuccessorSpaceCreated as SuccessSpaceCreatedEvent;
use space_setup::events::GeoSpacePluginCreated as GeoSpacePluginCreatedEvent;

#[substreams::handlers::map]
fn map_entries_added(block: eth::v2::Block) -> Result<EntriesAdded, substreams::errors::Error> {
    let entries = block
        .logs()
        .filter_map(|log| {
            if let Some(entry) = EntryAddedEvent::match_and_decode(log) {
                let tx_hash = format_hex(&log.receipt.transaction.hash);
                let log_index = log.index();
                let block_number = block.number;
                let id = format!("{block_number}-{tx_hash}-{log_index}");
                let address = format_hex(&log.address());
                Some((entry, id, address))
            } else {
                None
            }
        })
        .map(|(entry, id, address)| EntryAdded {
            id,
            index: entry.index.to_string(),
            uri: entry.uri,
            author: format_hex(&entry.author),
            space: address,
        })
        .collect::<Vec<EntryAdded>>();

    Ok(EntriesAdded { entries })
}

#[substreams::handlers::store]
fn store_addresses(entries: EntriesAdded, output: StoreSetIfNotExistsString) {
    let addresses = entries
        .entries
        .iter()
        .map(|entry| &entry.space)
        .collect::<Vec<&String>>();

    for address in addresses.iter() {
        output.set_if_not_exists(0, &address, address);
    }
}

#[substreams::handlers::map]
fn map_roles(block: eth::v2::Block) -> Result<RoleChanges, substreams::errors::Error> {
    let changes: Vec<RoleChange> = block
        .logs()
        .filter_map(|log| {
            let tx_hash = format_hex(&log.receipt.transaction.hash);
            let log_index = log.index();
            let block_number = block.number;
            let id = format!("{block_number}-{tx_hash}-{log_index}");
            let address = format_hex(&log.address());

            if let Some(role_granted) = RoleGranted::match_and_decode(log) {
                let change = ChangeKind::Granted(role_granted);
                return Some((change, id, address));
            }
            if let Some(role_revoked) = RoleRevoked::match_and_decode(log) {
                let change = ChangeKind::Revoked(role_revoked);
                return Some((change, id, address));
            }

            return None;
        })
        .map(|(role_change, id, address)| role_change.as_change(id, address))
        .collect();

    Ok(RoleChanges { changes })
}

#[substreams::handlers::map]
fn map_profiles_registered(
    block: eth::v2::Block,
) -> Result<GeoProfilesRegistered, substreams::errors::Error> {
    let profiles: Vec<GeoProfileRegistered> = block
        .logs()
        .filter_map(|log| {
            if let Some(profile_registered) = GeoProfileRegisteredEvent::match_and_decode(log) {
                return Some(profile_registered);
            }

            return None;
        })
        .map(|profile_registered| GeoProfileRegistered {
            id: profile_registered.id.to_string(),
            requestor: format_hex(&profile_registered.account),
            space: format_hex(&profile_registered.home_space),
        })
        .collect();

    Ok(GeoProfilesRegistered { profiles })
}

#[substreams::handlers::map]
fn map_successor_spaces_created(
    block: eth::v2::Block,
) -> Result<SuccessorSpacesCreated, substreams::errors::Error> {
    let successor_spaces: Vec<SuccessorSpaceCreated> = block
        .logs()
        .filter_map(|log| {
            let address = format_hex(&log.address());

            if let Some(successor_space_created) = SuccessSpaceCreatedEvent::match_and_decode(log) {
                return Some(SuccessorSpaceCreated {
                    plugin_address: address,
                    predecessor_space: format_hex(&successor_space_created.predecessor_space),
                });
            }

            return None;
        })
        .collect();

    Ok(SuccessorSpacesCreated {
        spaces: successor_spaces,
    })
}

#[substreams::handlers::map]
fn map_spaces_created(
    block: eth::v2::Block,
) -> Result<GeoSpacesCreated, substreams::errors::Error> {
    let spaces: Vec<GeoSpaceCreated> = block
        .logs()
        .filter_map(|log| {
            if let Some(space_created) = GeoSpacePluginCreatedEvent::match_and_decode(log) {
                return Some(GeoSpaceCreated {
                    dao_address: format_hex(&space_created.dao),
                    space_address: format_hex(&space_created.plugin),
                });
            }

            return None;
        })
        .collect();

    Ok(GeoSpacesCreated { spaces })
}

#[substreams::handlers::map]
fn map_governance_plugins_created(
    block: eth::v2::Block,
) -> Result<GeoGovernancePluginsCreated, substreams::errors::Error> {
    let plugins: Vec<GeoGovernancePluginCreated> = block
        .logs()
        .filter_map(|log| {
            if let Some(space_governance_created) =
                GeoGovernancePluginCreatedEvent::match_and_decode(log)
            {
                return Some(GeoGovernancePluginCreated {
                    dao_address: format_hex(&space_governance_created.dao),
                    main_voting_address: format_hex(&space_governance_created.main_voting_plugin),
                    member_access_address: format_hex(
                        &space_governance_created.member_access_plugin,
                    ),
                });
            }

            return None;
        })
        .collect();

    Ok(GeoGovernancePluginsCreated { plugins })
}

#[substreams::handlers::map]
fn geo_out(
    entries: EntriesAdded,
    role_changes: RoleChanges,
    profiles_registered: GeoProfilesRegistered,
    successor_spaces_created: SuccessorSpacesCreated,
    spaces_created: GeoSpacesCreated,
    governance_plugins_created: GeoGovernancePluginsCreated,
) -> Result<GeoOutput, substreams::errors::Error> {
    let entries = entries.entries;
    let role_changes = role_changes.changes;
    let profiles_registered = profiles_registered.profiles;
    let successor_spaces_created = successor_spaces_created.spaces;
    let spaces_created = spaces_created.spaces;
    let governance_plugins_created = governance_plugins_created.plugins;

    Ok(GeoOutput {
        entries,
        role_changes,
        profiles_registered,
        successor_spaces_created,
        spaces_created,
        governance_plugins_created,
    })
}
