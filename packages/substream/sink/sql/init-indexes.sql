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

CREATE INDEX edits_space_id
    on edits (space_id);

CREATE INDEX edits_created_by_id
    on edits (created_by_id);

CREATE INDEX proposal_edit_id
    on proposals (edit_id);

CREATE INDEX versions_proposal_id
    on versions (proposal_id);

CREATE INDEX versions_created_by_id
    on versions (created_by_id);

CREATE INDEX versions_entity_id
    on versions (entity_id);

CREATE INDEX versions_space_id
    on versions (space_id);

CREATE INDEX relations_to_entity_id
    on relations (to_entity_id);

CREATE INDEX relations_from_entity_id
    on relations (from_entity_id);
