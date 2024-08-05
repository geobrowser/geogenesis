
--
-- Custom Postgraphile Query Results for Attribute Functions
--
CREATE TYPE public.attribute_with_scalar_value_type AS (
    type text,
    value text
);

CREATE TYPE public.attribute_with_relation_value_type AS (
    type text,
    entity_value_id text
);

CREATE TYPE public.attribute_with_unknown_value_type AS (
   type text,
   value text,
   entity_value_id text
);

COMMENT ON TYPE public.attribute_with_relation_value_type IS
  E'@foreignKey (entity_value_id) references public.entities (id)';


COMMENT ON TYPE public.attribute_with_unknown_value_type IS
  E'@foreignKey (entity_value_id) references public.entities (id)';

--
-- Query "types" on entities to get the types of an entity or "typeCount" to get the number of types
-- "typeCount" can be used for filtering
--
CREATE FUNCTION public.entities_types(e_row entities)
RETURNS SETOF public.entities AS $$
BEGIN
    RETURN QUERY
    SELECT e.*
    FROM entities e
    WHERE e.id IN (
        SELECT t.entity_value_id
        FROM triples t
        WHERE t.entity_id = e_row.id
        AND t.attribute_id = '8f151ba4de204e3c9cb499ddf96f48f1'
    );
END;
$$ LANGUAGE plpgsql STRICT STABLE;

CREATE FUNCTION public.entities_types_count(e_row entities)
RETURNS integer AS $$
DECLARE
    type_count integer;
BEGIN
    SELECT count(*)
    INTO type_count
    FROM entities_types(e_row);
    RETURN type_count;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

--
-- Query "typeSchema" on a type entity (e.g. Place) to get it's attributes
-- "typeSchemaCount" can be used for filtering
--
CREATE FUNCTION public.entities_type_schema(e_row entities)
RETURNS SETOF public.entities AS $$
BEGIN
    RETURN QUERY
    SELECT e.*
    FROM entities e
    WHERE e.id IN (
        SELECT t.entity_value_id
        FROM triples t
        WHERE t.entity_id = e_row.id
        AND t.attribute_id = '8f151ba4de204e3c9cb499ddf96f48f1'
    );
END;
$$ LANGUAGE plpgsql STRICT STABLE;

CREATE FUNCTION public.entities_type_schema_count(e_row entities)
RETURNS integer AS $$
DECLARE
    attribute_count integer;
BEGIN
    SELECT count(*)
    INTO attribute_count
    FROM entities_type_schema(e_row);
    RETURN attribute_count;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

-- 
-- Query "schema" on an instance of a type entity (e.g. San Francisco) to get it's inferred type attributes
-- "schemaCount" can be used for filtering
--
CREATE FUNCTION public.entities_schema(e_row entities)
RETURNS SETOF public.entities AS $$
BEGIN
    -- Using CTE to first fetch all types of the given entity
    RETURN QUERY
    WITH entity_types AS (
        SELECT t.entity_value_id AS type_id
        FROM triples t
        WHERE t.entity_id = e_row.id
        AND t.attribute_id = '8f151ba4de204e3c9cb499ddf96f48f1' -- Types
    ),
    type_attributes AS (
        -- For each type, fetch the associated attributes
        SELECT DISTINCT t.entity_value_id AS attribute_id -- This might point to a collection in which the query will fail
        FROM entity_types et
        JOIN triples t ON t.entity_id = et.type_id
        AND t.attribute_id = '01412f8381894ab1836565c7fd358cc1' -- Attributes
    )
    SELECT e.*
    FROM entities e
    JOIN type_attributes ta ON e.id = ta.attribute_id;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

CREATE FUNCTION public.entities_schema_count(e_row entities)
RETURNS integer AS $$
DECLARE
    attribute_count integer;
BEGIN
    SELECT count(*)
    INTO attribute_count
    FROM entities_schema(e_row);
    RETURN attribute_count;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

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
