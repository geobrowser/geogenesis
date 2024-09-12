CREATE INDEX idx_entity_attribute ON public.triples(entity_id, attribute_id);
CREATE INDEX idx_entity_attribute_value_id ON public.triples(entity_id, attribute_id, entity_value_id);
CREATE INDEX idx_entity_value_id ON public.triples(entity_value_id);
CREATE INDEX idx_triple_space ON public.triples(space_id);
CREATE INDEX idx_space_editors ON public.space_editors(account_id, space_id);
CREATE INDEX idx_space_members ON public.space_members(account_id, space_id);
CREATE INDEX space_metadata ON public.spaces_metadata(entity_id, space_id);
CREATE INDEX entity_space ON public.entity_spaces(entity_id, space_id);

CREATE INDEX triple_entity_id
    on triples (entity_id);

CREATE INDEX versions_entity_id
    on versions (entity_id);

-- CREATE INDEX triple_versions_triple_index
--     on triple_versions (triple_id);

-- CREATE INDEX triple_versions_version_index
--     on triple_versions (version_id);

CREATE INDEX edits_space_id
    on edits (space_id);

CREATE INDEX edits_created_by_id
    on edits (created_by_id);

CREATE INDEX proposal_edit_id
    on proposals (edit_id);

CREATE INDEX proposal_proposed_versions
    on proposed_versions (proposal_id);

CREATE INDEX proposal_space_id
    on proposed_versions (space_id);

CREATE INDEX proposal_versions 
    on proposed_versions (proposal_id);

CREATE INDEX onchain_profile_account_id
    on onchain_profiles (account_id);

CREATE INDEX onchain_profile_space_id
    on onchain_profiles (home_space_id);

CREATE INDEX relations_to_entity_id
    on relations (to_entity_id);

CREATE INDEX relations_from_entity_id
    on relations (from_entity_id);
