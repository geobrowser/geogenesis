CREATE INDEX idx_entity_attribute ON public.triples(entity_id, attribute_id);
CREATE INDEX idx_entity_attribute_value_id ON public.triples(entity_id, attribute_id, entity_value_id);
CREATE INDEX idx_entity_value_id ON public.triples(entity_value_id);
CREATE INDEX idx_triple_space ON public.triples(space_id);
CREATE INDEX idx_space_editors ON public.space_editors(account_id, space_id);
CREATE INDEX idx_space_members ON public.space_members(account_id, space_id);
CREATE INDEX space_metadata ON public.spaces_metadata(entity_id, space_id);
CREATE INDEX version_spaces_version_id ON public.version_spaces(version_id, space_id);
CREATE INDEX version_types_version_id ON public.version_types(version_id, type_id);

CREATE INDEX triple_entity_id
    on triples (entity_id);

CREATE INDEX triple_attribute_id
    on triples (attribute_id);

CREATE INDEX triple_attribute_version_id
    on triples (attribute_version_id);

CREATE INDEX triple_version_id
    on triples (version_id);

CREATE INDEX edits_space_id
    on edits (space_id);

CREATE INDEX edits_created_by_id
    on edits (created_by_id);

CREATE INDEX proposal_edit_id
    on proposals (edit_id);

CREATE INDEX versions_id
    on versions (id);

CREATE INDEX versions_edit_id
    on versions (edit_id);

CREATE INDEX versions_created_by_id
    on versions (created_by_id);

CREATE INDEX versions_entity_id
    on versions (entity_id);

CREATE INDEX current_versions_entity_id
    on current_versions (entity_id);

CREATE INDEX current_versions_version_id
    on current_versions (version_id);

CREATE INDEX relations_type_of_id
    on relations (type_of_id);

CREATE INDEX relations_to_version_id
    on relations (to_version_id);

CREATE INDEX relations_from_version_id
    on relations (from_version_id);
