-- 
-- Create Indexes for Speedy Querying
-- 



CREATE INDEX idx_entity_attribute ON public.triples(entity_id, attribute_id);

CREATE INDEX idx_entity_attribute_value_id ON public.triples(entity_id, attribute_id, value_id);

CREATE INDEX idx_entity_value_id ON public.triples(entity_value_id);

CREATE INDEX idx_triple_space ON public.triples(space_id);

CREATE INDEX idx_accounts_space_id ON public.space_admins(account_id, space_id);

CREATE INDEX idx_space_editors ON public.space_editors(account_id, space_id);

CREATE INDEX idx_space_editor_controllers ON public.space_editor_controllers(account_id, space_id);

CREATE INDEX versions_entity_id
    on versions (entity_id);

CREATE INDEX triple_versions_triple_index
    on triple_versions (triple_id);

CREATE INDEX triple_versions_version_index
    on triple_versions (version_id);