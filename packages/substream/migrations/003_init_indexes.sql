-- 
-- Create Indexes for Speedy Querying
-- 



CREATE INDEX idx_entity_attribute ON public.triples(entity_id, attribute_id);

CREATE INDEX idx_entity_attribute_value_id ON public.triples(entity_id, attribute_id, entity_value_id);

CREATE INDEX idx_entity_value_id ON public.triples(entity_value_id);

CREATE INDEX idx_triple_space ON public.triples(space_id);

CREATE INDEX idx_space_editors ON public.space_editors(account_id, space_id);
CREATE INDEX idx_space_members ON public.space_members(account_id, space_id);

CREATE INDEX triple_entity_id
    on triples (entity_id);

CREATE INDEX versions_entity_id
    on versions (entity_id);

-- CREATE INDEX triple_versions_triple_index
--     on triple_versions (triple_id);

-- CREATE INDEX triple_versions_version_index
--     on triple_versions (version_id);

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

CREATE INDEX proposed_versions_ops
    on ops (proposed_version_id);

CREATE INDEX collection_item_collections
    on collection_items (collection_id);

CREATE INDEX collection_item_entities
    on collection_items (entity_id);
