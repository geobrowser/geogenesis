pub mod helpers;
mod pb;

use pb::schema::{
    EditorAdded, EditorsAdded, EntriesAdded, EntryAdded, GeoGovernancePluginCreated,
    GeoGovernancePluginsCreated, GeoOutput, GeoProfileRegistered, GeoProfilesRegistered,
    GeoSpaceCreated, GeoSpacesCreated, ProposalCreated, ProposalExecuted, ProposalProcessed,
    ProposalsCreated, ProposalsExecuted, ProposalsProcessed, RoleChange, RoleChanges,
    SubspaceAdded, SubspaceRemoved, SubspacesAdded, SubspacesRemoved, SuccessorSpaceCreated,
    SuccessorSpacesCreated, VoteCast, VotesCast,
};

use substreams::store::*;
use substreams_ethereum::{pb::eth, use_contract, Event};

use helpers::*;

use_contract!(legacy_space, "abis/legacy-space.json");
use_contract!(space, "abis/space.json");
use_contract!(geo_profile_registry, "abis/geo-profile-registry.json");
use_contract!(space_setup, "abis/space-setup.json");
use_contract!(governance_setup, "abis/governance-setup.json");
use_contract!(main_voting_plugin, "abis/main-voting-plugin.json");

use geo_profile_registry::events::GeoProfileRegistered as GeoProfileRegisteredEvent;
use governance_setup::events::GeoGovernancePluginsCreated as GeoGovernancePluginCreatedEvent;
use legacy_space::events::{EntryAdded as EntryAddedEvent, RoleGranted, RoleRevoked};
use main_voting_plugin::events::{
    EditorsAdded as EditorsAddedEvent, ProposalCreated as ProposalCreatedEvent,
    ProposalExecuted as ProposalExecutedEvent, VoteCast as VoteCastEvent,
};
use space::events::{
    GeoProposalProcessed, SubspaceAccepted, SubspaceRemoved as GeoSubspaceRemoved,
    SuccessorSpaceCreated as SuccessSpaceCreatedEvent,
};
use space_setup::events::GeoSpacePluginCreated as GeoSpacePluginCreatedEvent;

/**
 * We currently index two sets of contracts representing spaces:
 * 1. The original Space contract with simple permissions rules and no proposals.
 * 2. The new (as of January 23rd, 2024) DAO-based contracts with Plugins representing
 *    the Space and any governance and permissions rules.
 *
 * Having multiple sets of contracts means that we support multiple methods for
 * indexing data from these contracts, including the data representing the contracts
 * themselves like the address of the contract and any plugins (if they exist).
 *
 * We will eventually deprecate the existing contracts and migrate data and permissions
 * in them to the new contract implementation. To do this we will likely only index the
 * old contracts up to a specific block number and then index the new contracts from that
 * block.
 *
 * Alternatively we might look to "snapshot" the state of Geo at a specific timepoint
 * and migrate fully to the new contracts. This would likely coincide with a migration
 * to a separate blockchain.
 *
 * The new, DAO-based contracts are based on Aragon's OSX architecture in which a DAO's
 * onchain functionality is defined by a set of plugin contracts. These plugins can be
 * used for things like governance, membership, or representing an append-only log of
 * IPFS content.
 */

/**
 * Entries represent the content being added to a legacy space (See top level for more
 * info on the different space contracts). This content is stored on IPFS and represented
 * by a content URI.
 *
 * Additionally we map the author of the content and the space the content was added to.
 *
 * The new, DAO-based contracts have a different method and event for adding content to
 * a space which will get mapped in a separate handler.
 */
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

/**
 * Roles represent the permissions for a legacy space (See top level comment for more info
 * on the different space contracts). Roles fall into "admin", "editor controller" (moderator),
 * and "editor" (member) roles, each granting different permissions within the space.
 *
 * The new, DAO-based contracts have a different, but similar permissions model which will
 * get mapped in a separate handler.
 */
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

/**
 * Profiles represent the users of Geo. Profiles are registered in the GeoProfileRegistry
 * contract and are associated with a user's EVM-based address and the space where metadata
 * representing their profile resides in.
*/
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

/**
 * The new DAO-based contracts allow forking of spaces into successor spaces. This is so
 * users can create new spaces whose data is derived from another space.
 *
 * This is immediately useful when migrating from legacy spaces to the new DAO-based spaces,
 * but it's generally applicable across any space.
 */
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

/**
 * The new DAO-based space contracts are based on Aragon's OSX architecture which uses
 * plugins to define functionality assigned to a DAO (See the top level comment for more
 * information on Aragon's DAO architecture).
 *
 * This handler maps creation of the Space plugin and associates the Space plugin contract
 * address with the address of the DAO contract.
 */
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
fn map_subspaces_added(block: eth::v2::Block) -> Result<SubspacesAdded, substreams::errors::Error> {
    let subspaces: Vec<SubspaceAdded> = block
        .logs()
        .filter_map(|log| {
            if let Some(space_created) = SubspaceAccepted::match_and_decode(log) {
                return Some(SubspaceAdded {
                    change_type: "added".to_string(),
                    subspace: format_hex(&space_created.subspace_dao),
                    plugin_address: format_hex(&log.address()),
                });
            }

            return None;
        })
        .collect();

    Ok(SubspacesAdded { subspaces })
}

#[substreams::handlers::map]
fn map_subspaces_removed(
    block: eth::v2::Block,
) -> Result<SubspacesRemoved, substreams::errors::Error> {
    let subspaces: Vec<SubspaceRemoved> = block
        .logs()
        .filter_map(|log| {
            if let Some(space_created) = GeoSubspaceRemoved::match_and_decode(log) {
                return Some(SubspaceRemoved {
                    change_type: "removed".to_string(),
                    subspace: format_hex(&space_created.subspace_dao),
                    plugin_address: format_hex(&log.address()),
                });
            }

            return None;
        })
        .collect();

    Ok(SubspacesRemoved { subspaces })
}

/**
 * The new DAO-based space contracts are based on Aragon's OSX architecture which uses
 * plugins to define functionality assigned to a DAO (See the top level comment for more
 * information on Aragon's DAO architecture).
 *
 * This handler maps creation of any governance plugins and associates the governance plugins
 * contract addresses with the address of the DAO contract.
 *
 * As of January 23, 2024 there are two governance plugins:
 * 1. Voting plugin – This defines the voting and proposal rules and behaviors for a DAO
 * 2. Member access plugin – This defines the membership rules and behaviors for a DAO
 */
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

/**
 * An editor has editing and voting permissions in a DAO-based space. Editors join a space
 * one of two ways:
 * 1. They submit a request to join the space as an editor which goes to a vote. The editors
 *    in the space vote on whether to accept the new editor.
 * 2. They are added as a set of initial editors when first creating the space. This allows
 *    space deployers to bootstrap a set of editors on space creation.
 *
 * @TODO: We can optimize the output a bit for downstream sinks by flattening the addresses
 * array. Right now in the substream output we get:
 *
 * editors: [
 *   { addresses: [...] },
 * ].
 *
 * It would be nicer to just output a single array instead of a nested array.
 */
#[substreams::handlers::map]
fn map_editors_added(block: eth::v2::Block) -> Result<EditorsAdded, substreams::errors::Error> {
    let editors: Vec<EditorAdded> = block
        .logs()
        .filter_map(|log| {
            if let Some(editors_added) = EditorsAddedEvent::match_and_decode(log) {
                return Some(EditorAdded {
                    addresses: editors_added
                        .editors // contract event calls them members, but conceptually they are editors
                        .iter()
                        .map(|address| format_hex(address))
                        .collect(),
                    plugin_address: format_hex(&log.address()),
                });
            }

            return None;
        })
        .collect();

    Ok(EditorsAdded { editors })
}

/**
 * Proposals represent a proposal to change the state of a DAO-based space. Proposals can
 * represent changes to content, membership (editor or member), governance changes, subspace
 * membership, or anything else that can be executed by a DAO.
 *
 * Currently we use a simple majority voting model, where a proposal requires 51% of the
 * available votes in order to pass. Only editors are allowed to vote on proposals, but editors
 * _and_ members can create them.
 *
 * Proposals require encoding a "callback" that represents the action to be taken if the proposal
 * succeeds. For example, if a proposal is to add a new editor to the space, the callback would
 * be the encoded function call to add the editor to the space.
 *
 * ```ts
 * {
 *   to: `0x123...`, // The address of the membership contract
 *   data: `0x123...`, // The encoded function call parameters
 * }
 * ```
 */
#[substreams::handlers::map]
fn map_proposals_created(
    block: eth::v2::Block,
) -> Result<ProposalsCreated, substreams::errors::Error> {
    let proposals: Vec<ProposalCreated> = block
        .logs()
        .filter_map(|log| {
            if let Some(proposal_created) = ProposalCreatedEvent::match_and_decode(log) {
                // @TODO: Should we return none if actions is empty?
                return Some(ProposalCreated {
                    proposal_id: proposal_created.proposal_id.to_string(),
                    creator: format_hex(&proposal_created.creator),
                    start_time: proposal_created.start_date.to_string(),
                    end_time: proposal_created.end_date.to_string(),
                    metadata_uri: String::from_utf8(proposal_created.metadata).unwrap(),
                    plugin_address: format_hex(&log.address()),
                });
            }

            return None;
        })
        .collect();

    Ok(ProposalsCreated { proposals })
}

#[substreams::handlers::map]
fn map_proposals_executed(
    block: eth::v2::Block,
) -> Result<ProposalsExecuted, substreams::errors::Error> {
    let executed_proposals: Vec<ProposalExecuted> = block
        .logs()
        .filter_map(|log| {
            if let Some(proposal_created) = ProposalExecutedEvent::match_and_decode(log) {
                return Some(ProposalExecuted {
                    plugin_address: format_hex(&log.address()),
                    proposal_id: proposal_created.proposal_id.to_string(),
                });
            }

            return None;
        })
        .collect();

    Ok(ProposalsExecuted { executed_proposals })
}

/**
 * Processed Proposals represent content that has been approved by a DAO
 * and executed onchain.
 *
 * We use the content URI to represent the content that was approved. We
 * only consume the `proposalId` in the content URI to map the processed
 * data to an existing proposal onchain and in the sink.
*/
#[substreams::handlers::map]
fn map_proposals_processed(
    block: eth::v2::Block,
) -> Result<ProposalsProcessed, substreams::errors::Error> {
    let proposals: Vec<ProposalProcessed> = block
        .logs()
        .filter_map(|log| {
            if let Some(proposal_created) = GeoProposalProcessed::match_and_decode(log) {
                return Some(ProposalProcessed {
                    content_uri: proposal_created.content_uri,
                    plugin_address: format_hex(&log.address()),
                });
            }

            return None;
        })
        .collect();

    Ok(ProposalsProcessed { proposals })
}

/**
 * Votes represent a vote on a proposal in a DAO-based space.
 *
 * Currently we use a simple majority voting model, where a proposal requires 51% of the
 * available votes in order to pass. Only editors are allowed to vote on proposals, but editors
 * _and_ members can create them.
 */
#[substreams::handlers::map]
fn map_votes_cast(block: eth::v2::Block) -> Result<VotesCast, substreams::errors::Error> {
    let votes: Vec<VoteCast> = block
        .logs()
        .filter_map(|log| {
            // @TODO: Should we track our plugins/daos and only emit if the address is one of them?
            if let Some(vote_cast) = VoteCastEvent::match_and_decode(log) {
                return Some(VoteCast {
                    // The onchain proposal id is an incrementing integer. We represent
                    // the proposal with a more unique id in the sink, so we remap the
                    // name here to disambiguate between the onchain id and the sink id.
                    onchain_proposal_id: vote_cast.proposal_id.to_string(),
                    voter: format_hex(&vote_cast.voter),
                    plugin_address: format_hex(&log.address()),
                    vote_option: vote_cast.vote_option.to_u64(),
                });
            }

            return None;
        })
        .collect();

    Ok(VotesCast { votes })
}

#[substreams::handlers::map]
fn geo_out(
    entries: EntriesAdded,
    role_changes: RoleChanges,
    profiles_registered: GeoProfilesRegistered,
    spaces_created: GeoSpacesCreated,
    governance_plugins_created: GeoGovernancePluginsCreated,
    editors_added: EditorsAdded,
    proposals_created: ProposalsCreated,
    votes_cast: VotesCast,
    geo_proposals_processed: ProposalsProcessed,
    successor_spaces_created: SuccessorSpacesCreated,
    subspaces_added: SubspacesAdded,
    subspaces_removed: SubspacesRemoved,
    proposals_executed: ProposalsExecuted,
) -> Result<GeoOutput, substreams::errors::Error> {
    let entries = entries.entries;
    let role_changes = role_changes.changes;
    let profiles_registered = profiles_registered.profiles;
    let spaces_created = spaces_created.spaces;
    let governance_plugins_created = governance_plugins_created.plugins;
    let editors_added = editors_added.editors;
    let proposals_created = proposals_created.proposals;
    let votes_cast = votes_cast.votes;
    let proposals_processed = geo_proposals_processed.proposals;
    let successor_spaces_created = successor_spaces_created.spaces;
    let added_subspaces = subspaces_added.subspaces;
    let removed_subspaces = subspaces_removed.subspaces;
    let executed_proposals = proposals_executed.executed_proposals;

    Ok(GeoOutput {
        entries,
        role_changes,
        profiles_registered,
        spaces_created,
        governance_plugins_created,
        editors_added,
        proposals_created,
        votes_cast,
        proposals_processed,
        successor_spaces_created,
        subspaces_added: added_subspaces,
        subspaces_removed: removed_subspaces,
        executed_proposals,
    })
}
