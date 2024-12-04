pub mod helpers;

mod pb;

use pb::schema::{
    EditPublished, EditorAdded, EditorRemoved, EditorsAdded, EditorsRemoved, EditsPublished,
    GeoGovernancePluginCreated, GeoGovernancePluginsCreated, GeoOutput,
    GeoPersonalSpaceAdminPluginCreated, GeoPersonalSpaceAdminPluginsCreated, GeoSpaceCreated,
    GeoSpacesCreated, InitialEditorAdded, InitialEditorsAdded, MemberAdded, MemberRemoved,
    MembersAdded, MembersRemoved, ProposalExecuted, ProposalsExecuted, PublishEditProposalCreated,
    PublishEditsProposalsCreated, SubspaceAdded, SubspaceRemoved, SubspacesAdded, SubspacesRemoved,
    SuccessorSpaceCreated, SuccessorSpacesCreated, VoteCast, VotesCast,
};

use substreams_ethereum::{pb::eth, use_contract, Event};

use helpers::*;

use_contract!(space, "abis/space.json");
use_contract!(space_setup, "abis/space-setup.json");
use_contract!(governance_setup, "abis/governance-setup.json");
use_contract!(personal_admin_setup, "abis/personal-admin-setup.json");
use_contract!(personal_admin_plugin, "abis/personal-admin-plugin.json");
use_contract!(main_voting_plugin, "abis/main-voting-plugin.json");
use_contract!(member_access_plugin, "abis/member-access-plugin.json");
use_contract!(
    majority_voting_base_plugin,
    "abis/majority-voting-base.json"
);

use governance_setup::events::GeoGovernancePluginsCreated as GovernancePluginCreatedEvent;
use main_voting_plugin::events::{
    EditorAdded as EditorAddedEvent, EditorRemoved as EditorRemovedEvent,
    EditorsAdded as EditorsAddedEvent, MemberAdded as MemberAddedEvent,
    MemberRemoved as MemberRemovedEvent, ProposalExecuted as ProposalExecutedEvent,
    PublishEditsProposalCreated as PublishEditsProposalCreatedEvent,
};
use majority_voting_base_plugin::events::VoteCast as VoteCastEvent;
use personal_admin_setup::events::GeoPersonalAdminPluginCreated as GeoPersonalAdminPluginCreatedEvent;
use space::events::{
    EditsPublished as EditsPublishedEvent, SubspaceAccepted as SubspaceAcceptedEvent,
    SubspaceRemoved as SubspaceRemovedEvent, SuccessorSpaceCreated as SuccessorSpaceCreatedEvent,
};
use space_setup::events::GeoSpacePluginCreated as SpacePluginCreatedEvent;

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

            if let Some(successor_space_created) = SuccessorSpaceCreatedEvent::match_and_decode(log)
            {
                return Some(SuccessorSpaceCreated {
                    plugin_address: address,
                    predecessor_space: format_hex(&successor_space_created.predecessor_space),
                    dao_address: format_hex(&successor_space_created.dao),
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
            if let Some(space_created) = SpacePluginCreatedEvent::match_and_decode(log) {
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
            if let Some(space_created) = SubspaceAcceptedEvent::match_and_decode(log) {
                return Some(SubspaceAdded {
                    change_type: "added".to_string(),
                    subspace: format_hex(&space_created.subspace_dao),
                    plugin_address: format_hex(&log.address()),
                    dao_address: format_hex(&space_created.dao),
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
            if let Some(space_created) = SubspaceRemovedEvent::match_and_decode(log) {
                return Some(SubspaceRemoved {
                    change_type: "removed".to_string(),
                    subspace: format_hex(&space_created.subspace_dao),
                    plugin_address: format_hex(&log.address()),
                    dao_address: format_hex(&space_created.dao),
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
                GovernancePluginCreatedEvent::match_and_decode(log)
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
fn map_personal_admin_plugins_created(
    block: eth::v2::Block,
) -> Result<GeoPersonalSpaceAdminPluginsCreated, substreams::errors::Error> {
    let plugins: Vec<GeoPersonalSpaceAdminPluginCreated> = block
        .logs()
        .filter_map(|log| {
            if let Some(personal_space_created) =
                GeoPersonalAdminPluginCreatedEvent::match_and_decode(log)
            {
                return Some(GeoPersonalSpaceAdminPluginCreated {
                    initial_editor: format_hex(&personal_space_created.initial_editor),
                    dao_address: format_hex(&personal_space_created.dao),
                    personal_admin_address: (format_hex(
                        &personal_space_created.personal_admin_plugin,
                    )),
                });
            }

            return None;
        })
        .collect();

    Ok(GeoPersonalSpaceAdminPluginsCreated { plugins })
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
fn map_initial_editors_added(
    block: eth::v2::Block,
) -> Result<InitialEditorsAdded, substreams::errors::Error> {
    let editors: Vec<InitialEditorAdded> = block
        .logs()
        .filter_map(|log| {
            if let Some(editors_added) = EditorsAddedEvent::match_and_decode(log) {
                return Some(InitialEditorAdded {
                    addresses: editors_added
                        .editors // contract event calls them members, but conceptually they are editors
                        .iter()
                        .map(|address| format_hex(address))
                        .collect(),
                    plugin_address: format_hex(&log.address()),
                    dao_address: format_hex(&editors_added.dao),
                });
            }

            return None;
        })
        .collect();

    Ok(InitialEditorsAdded { editors })
}

#[substreams::handlers::map]
fn map_members_added(block: eth::v2::Block) -> Result<MembersAdded, substreams::errors::Error> {
    let members: Vec<MemberAdded> = block
        .logs()
        .filter_map(|log| {
            if let Some(members_approved) = MemberAddedEvent::match_and_decode(log) {
                return Some(MemberAdded {
                    change_type: "added".to_string(),
                    main_voting_plugin_address: format_hex(&log.address()),
                    member_address: format_hex(&members_approved.member),
                    dao_address: format_hex(&members_approved.dao),
                });
            }

            return None;
        })
        .collect();

    Ok(MembersAdded { members })
}

#[substreams::handlers::map]
fn map_members_removed(block: eth::v2::Block) -> Result<MembersRemoved, substreams::errors::Error> {
    let members: Vec<MemberRemoved> = block
        .logs()
        .filter_map(|log| {
            if let Some(members_approved) = MemberRemovedEvent::match_and_decode(log) {
                return Some(MemberRemoved {
                    change_type: "removed".to_string(),
                    dao_address: format_hex(&members_approved.dao),
                    plugin_address: format_hex(&log.address()),
                    member_address: format_hex(&members_approved.member),
                });
            }

            return None;
        })
        .collect();

    Ok(MembersRemoved { members })
}

#[substreams::handlers::map]
fn map_editors_added(block: eth::v2::Block) -> Result<EditorsAdded, substreams::errors::Error> {
    let editors: Vec<EditorAdded> = block
        .logs()
        .filter_map(|log| {
            if let Some(members_approved) = EditorAddedEvent::match_and_decode(log) {
                return Some(EditorAdded {
                    change_type: "added".to_string(),
                    main_voting_plugin_address: format_hex(&log.address()),
                    editor_address: format_hex(&members_approved.editor),
                    dao_address: format_hex(&members_approved.dao),
                });
            }

            return None;
        })
        .collect();

    Ok(EditorsAdded { editors })
}

#[substreams::handlers::map]
fn map_editors_removed(block: eth::v2::Block) -> Result<EditorsRemoved, substreams::errors::Error> {
    let editors: Vec<EditorRemoved> = block
        .logs()
        .filter_map(|log| {
            if let Some(members_approved) = EditorRemovedEvent::match_and_decode(log) {
                return Some(EditorRemoved {
                    change_type: "removed".to_string(),
                    plugin_address: format_hex(&log.address()),
                    editor_address: format_hex(&members_approved.editor),
                    dao_address: format_hex(&members_approved.dao),
                });
            }

            return None;
        })
        .collect();

    Ok(EditorsRemoved { editors })
}

/**
* Proposals for each proposal type
* 1. Add member
* 2. Remove member
* 3. Add editor
* 4. Remove editor
* 5. Add subspace
* 6. Remove subspace
* 7. Publish edits
*/

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
// #[substreams::handlers::map]
// fn map_proposals_created(
//     block: eth::v2::Block,
// ) -> Result<ProposalsCreated, substreams::errors::Error> {
//     let proposals: Vec<ProposalCreated> = block
//         .logs()
//         .filter_map(|log| {
//             if let Some(proposal_created) = ProposalCreatedEvent::match_and_decode(log) {
//                 // @TODO: Should we return none if actions is empty?
//                 return Some(ProposalCreated {
//                     proposal_id: proposal_created.proposal_id.to_string(),
//                     creator: format_hex(&proposal_created.creator),
//                     start_time: proposal_created.start_date.to_string(),
//                     end_time: proposal_created.end_date.to_string(),
//                     metadata_uri: String::from_utf8(proposal_created.metadata).unwrap(),
//                     plugin_address: format_hex(&log.address()),
//                 });
//             }

//             return None;
//         })
//         .collect();

//     Ok(ProposalsCreated { proposals })
// }

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
fn map_edits_published(block: eth::v2::Block) -> Result<EditsPublished, substreams::errors::Error> {
    let edits: Vec<EditPublished> = block
        .logs()
        .filter_map(|log| {
            if let Some(edit_published) = EditsPublishedEvent::match_and_decode(log) {
                return Some(EditPublished {
                    content_uri: edit_published.content_uri,
                    dao_address: format_hex(&edit_published.dao),
                    plugin_address: format_hex(&log.address()),
                });
            }

            return None;
        })
        .collect();

    Ok(EditsPublished { edits })
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
fn map_publish_edits_proposals_created(
    block: eth::v2::Block,
) -> Result<PublishEditsProposalsCreated, substreams::errors::Error> {
    let edits: Vec<PublishEditProposalCreated> = block
        .logs()
        .filter_map(|log| {
            // @TODO: Should we track our plugins/daos and only emit if the address is one of them?
            if let Some(proposed_edit) = PublishEditsProposalCreatedEvent::match_and_decode(log) {
                return Some(PublishEditProposalCreated {
                    // The onchain proposal id is an incrementing integer. We represent
                    // the proposal with a more unique id in the sink, so we remap the
                    // name here to disambiguate between the onchain id and the sink id.
                    proposal_id: proposed_edit.proposal_id.to_string(),
                    creator: format_hex(&proposed_edit.creator),
                    start_time: proposed_edit.start_date.to_string(),
                    end_time: proposed_edit.end_date.to_string(),
                    content_uri: proposed_edit.content_uri,
                    plugin_address: format_hex(&log.address()),
                    dao_address: format_hex(&proposed_edit.dao),
                });
            }

            return None;
        })
        .collect();

    Ok(PublishEditsProposalsCreated { edits })
}

#[substreams::handlers::map]
fn geo_out(
    spaces_created: GeoSpacesCreated,
    governance_plugins_created: GeoGovernancePluginsCreated,
    initial_editors_added: InitialEditorsAdded,
    votes_cast: VotesCast,
    edits_published: EditsPublished,
    successor_spaces_created: SuccessorSpacesCreated,
    subspaces_added: SubspacesAdded,
    subspaces_removed: SubspacesRemoved,
    proposals_executed: ProposalsExecuted,
    members_added: MembersAdded,
    editors_added: EditorsAdded,
    personal_admin_plugins_created: GeoPersonalSpaceAdminPluginsCreated,
    members_removed: MembersRemoved,
    editors_removed: EditorsRemoved,
    edit_proposals: PublishEditsProposalsCreated,
) -> Result<GeoOutput, substreams::errors::Error> {
    let spaces_created = spaces_created.spaces;
    let governance_plugins_created = governance_plugins_created.plugins;
    let initial_editors_added = initial_editors_added.editors;
    let votes_cast = votes_cast.votes;
    let edits_published = edits_published.edits;
    let successor_spaces_created = successor_spaces_created.spaces;
    let added_subspaces = subspaces_added.subspaces;
    let removed_subspaces = subspaces_removed.subspaces;
    let executed_proposals = proposals_executed.executed_proposals;
    let members_added = members_added.members;
    let editors_added = editors_added.editors;
    let members_removed = members_removed.members;
    let editors_removed = editors_removed.editors;
    let personal_admin_plugins_created = personal_admin_plugins_created.plugins;
    let edit_proposals_created = edit_proposals.edits;

    Ok(GeoOutput {
        spaces_created,
        governance_plugins_created,
        initial_editors_added,
        votes_cast,
        edits_published,
        successor_spaces_created,
        subspaces_added: added_subspaces,
        subspaces_removed: removed_subspaces,
        executed_proposals,
        members_added,
        editors_added,
        personal_plugins_created: personal_admin_plugins_created,
        members_removed,
        editors_removed,
        edits: edit_proposals_created,
    })
}
