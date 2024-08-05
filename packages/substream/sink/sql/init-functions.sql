-- Right now we're doing this logic in the indexer.
-- CREATE OR REPLACE FUNCTION public.set_entities_spaces() RETURNS trigger AS $$
-- BEGIN
--     INSERT INTO public.entity_spaces(entity_id, space_id) VALUES (NEW.entity_id, NEW.space_id)
--         ON CONFLICT DO NOTHING;
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql STRICT;

-- CREATE TRIGGER set_space_for_entity
-- AFTER INSERT ON public.triples
-- FOR EACH ROW
-- EXECUTE FUNCTION public.set_entities_spaces();

-- @TODO
-- create trigger for types on an entity
-- create trigger for metadata on an space
-- create trigger for removing space on an entity
-- create trigger for removing type on an entity
-- create trigger for removing metadata on a space

-- create trigger for schema on an entity
-- create trigger for removing schema on an entity
