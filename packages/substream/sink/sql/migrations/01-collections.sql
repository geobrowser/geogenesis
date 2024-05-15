CREATE TABLE public.collections (
    id text PRIMARY KEY NOT NULL,
    entity_id text REFERENCES public.geo_entities(id) NOT NULL
);

CREATE OR REPLACE FUNCTION public.spaces_metadata(e_row spaces)
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
        AND t.entity_value_id = '1d5d0c2a-db23-466c-a0b0-9abe879df457' -- space configuration
        AND t.is_stale = FALSE
    )
    SELECT e.*
    FROM geo_entities e
    JOIN space_configuration_entity_ids eids ON e.id = eids.entity_id;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

-- Map the account id to a geo profile based on the entity id of
-- the account's onchain profile if it exists
CREATE OR REPLACE FUNCTION public.accounts_geo_profiles(e_row accounts)
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

-- if an entity is a collection, return all the items in the collection
-- with links to the entities themselves

CREATE TYPE public.collection_item AS (
   entity_id text,
   collection_id text,
   index text
);

COMMENT ON TYPE public.collection_item IS
  E'@foreignKey (collection_id) references public.collections(entity_id)';

COMMENT ON TYPE public.collection_item IS
  E'@foreignKey (entity_id) references public.geo_entities(id)';

CREATE OR REPLACE FUNCTION public.collections_items(e_row collections)
RETURNS SETOF public.collection_item AS $$
BEGIN
    RETURN QUERY
    SELECT t3.entity_value_id as collection_id, t2.entity_value_id as entity_id, t4.string_value as index
    FROM triples t1
    JOIN triples t2 ON t1.entity_id = t2.entity_id
    JOIN triples t3 ON t1.entity_id = t3.entity_id
    JOIN triples t4 ON t1.entity_id = t4.entity_id 
    WHERE t1.entity_id = e_row.entity_id
      AND t1.attribute_id = 'types'
      AND t1.entity_value_id = '0e8d692b-94d7-4c64-bcb3-0eb4d55503ef' -- Collection Item type
      AND t2.attribute_id = '53d1e5f2-6f23-4bf2-9e88-42b02f437970' -- entity id of the collection item's entity value
      AND t3.attribute_id = '487e084b-4132-4b05-b15a-b6e147d58244' -- entity id of the collection
      AND t4.attribute_id = 'ede47e69-30b0-4499-8ea4-aafbda449609'; -- fractional index of the collection item
END;
$$ LANGUAGE plpgsql STRICT STABLE;
