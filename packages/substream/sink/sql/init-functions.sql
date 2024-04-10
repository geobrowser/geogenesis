
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
  E'@foreignKey (entity_value_id) references public.geo_entities (id)';

   
COMMENT ON TYPE public.attribute_with_unknown_value_type IS
  E'@foreignKey (entity_value_id) references public.geo_entities (id)';

--
-- Postgraphile function and types section
-- Note that attribute_id is hardcoded to '01412f83-8189-4ab1-8365-65c7fd358cc1' and type_id is 'type'
--

-- 
-- Query "types" on entities to get the types of an entity or "typeCount" to get the number of types
-- "typeCount" can be used for filtering 
-- 
CREATE FUNCTION public.geo_entities_types(e_row geo_entities)
RETURNS SETOF public.geo_entities AS $$
BEGIN
    RETURN QUERY
    SELECT e.*
    FROM geo_entities e
    WHERE e.id IN (
        SELECT t.value_id
        FROM triples t
        WHERE t.entity_id = e_row.id 
        AND t.attribute_id = '01412f83-8189-4ab1-8365-65c7fd358cc1' 
    );
END;
$$ LANGUAGE plpgsql STRICT STABLE;  

CREATE FUNCTION public.geo_entities_types_count(e_row geo_entities)
RETURNS integer AS $$
DECLARE
    type_count integer;
BEGIN
    SELECT count(*)
    INTO type_count
    FROM geo_entities_types(e_row);
    RETURN type_count;
END;
$$ LANGUAGE plpgsql STRICT STABLE;    

-- 
-- Query "typeSchema" on a type entity (e.g. Place) to get it's attributes
-- "typeSchemaCount" can be used for filtering
--
CREATE FUNCTION public.geo_entities_type_schema(e_row geo_entities)
RETURNS SETOF public.geo_entities AS $$
BEGIN
    RETURN QUERY
    SELECT e.*
    FROM geo_entities e
    WHERE e.id IN (
        SELECT t.value_id
        FROM triples t
        WHERE t.entity_id = e_row.id
        AND t.attribute_id = '01412f83-8189-4ab1-8365-65c7fd358cc1'
    );
END;
$$ LANGUAGE plpgsql STRICT STABLE;

CREATE FUNCTION public.geo_entities_type_schema_count(e_row geo_entities)
RETURNS integer AS $$
DECLARE
    attribute_count integer;
BEGIN
    SELECT count(*)
    INTO attribute_count
    FROM geo_entities_type_schema(e_row);
    RETURN attribute_count;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

-- 
-- Query "schema" on an instance of a type entity (e.g. San Francisco) to get it's inferred type attributes
-- "schemaCount" can be used for filtering
--
CREATE FUNCTION public.geo_entities_schema(e_row geo_entities)
RETURNS SETOF public.geo_entities AS $$
BEGIN
    -- Using CTE to first fetch all types of the given entity
    RETURN QUERY 
    WITH entity_types AS (
        SELECT t.value_id AS type_id
        FROM triples t
        WHERE t.entity_id = e_row.id 
        AND t.attribute_id = 'type'
    ),
    type_attributes AS (
        -- For each type, fetch the associated attributes
        SELECT DISTINCT t.value_id AS attribute_id
        FROM entity_types et
        JOIN triples t ON t.entity_id = et.type_id 
        AND t.attribute_id = '01412f83-8189-4ab1-8365-65c7fd358cc1' 

    )
    SELECT e.*
    FROM geo_entities e
    JOIN type_attributes ta ON e.id = ta.attribute_id;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

CREATE FUNCTION public.geo_entities_schema_count(e_row geo_entities)
RETURNS integer AS $$
DECLARE
    attribute_count integer;
BEGIN
    SELECT count(*)
    INTO attribute_count
    FROM geo_entities_schema(e_row);
    RETURN attribute_count;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

CREATE FUNCTION public.spaces_metadata(e_row spaces)
RETURNS SETOF public.geo_entities AS $$
BEGIN
    -- Using CTE to first fetch all types of the given entity
    RETURN QUERY 
    -- Get the entity id 
    WITH space_configuration_entity_ids AS (
        SELECT t.*
        FROM triples t
        WHERE t.space_id = e_row.id
        AND t.attribute_id = 'type'
        AND t.value_id = '1d5d0c2a-db23-466c-a0b0-9abe879df457' -- space configuration
    )
    SELECT e.*
    FROM geo_entities e
    JOIN space_configuration_entity_ids eids ON e.id = eids.entity_id;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

-- Map the account id to a geo profile based on the entity id of
-- the account's onchain profile if it exists
CREATE FUNCTION public.accounts_geo_profiles(e_row accounts)
RETURNS SETOF public.geo_entities AS $$
BEGIN
    RETURN QUERY 
    -- Get the onchain profile that matches the account id
    WITH onchain_profiles_ids AS (
        SELECT op.*
        FROM onchain_profiles op
        WHERE op.account_id = e_row.id
    )
    SELECT e.*
    FROM geo_entities e
    -- Return the entity id that matches the onchain profile id
    INNER JOIN onchain_profiles_ids opids ON e.id = opids.id;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

-- CREATE FUNCTION public.geo_entities_collection_items(e_row entities)
-- RETURNS SETOF public.geo_entities AS $$
-- BEGIN
--     RETURN QUERY 
--     -- Get the onchain profile that matches the account id
--    WITH collection_entities AS (
--         SELECT t.*
--         FROM triples t
--         WHERE t.attribute_id = 'type'
--         AND t.value_id = 'debbf9ff-62c6-40aa-9b2c-672e3bb15d0e' -- collection type
--     )
--     SELECT e.*
--     FROM geo_entities e
--     JOIN collection_entities cids ON e.id = cids.entity_id;
-- END;
-- $$ LANGUAGE plpgsql STRICT STABLE;