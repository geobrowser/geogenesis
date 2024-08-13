-- CREATE OR REPLACE FUNCTION public.spaces_metadata(e_row spaces)
-- RETURNS SETOF public.entities AS $$
-- BEGIN
--     -- Using CTE to first fetch all types of the given entity
--     RETURN QUERY
--     -- Get the entity id
--     WITH space_configuration_entity_ids AS (
--         SELECT t.*
--         FROM triples t
--         WHERE t.space_id = e_row.id
--         AND t.attribute_id = '8f151ba4de204e3c9cb499ddf96f48f1'
--         AND t.entity_value_id = '1d5d0c2adb23466ca0b09abe879df457' -- space configuration
--         AND t.is_stale = FALSE
--     )
--     SELECT e.*
--     FROM entities e
--     JOIN space_configuration_entity_ids eids ON e.id = eids.entity_id;
-- END;
-- $$ LANGUAGE plpgsql STRICT STABLE;

-- Map the account id to a geo profile based on the entity id of
-- the account's onchain profile if it exists
CREATE OR REPLACE FUNCTION public.accounts_geo_profiles(e_row accounts)
RETURNS SETOF public.entities AS $$
BEGIN
    RETURN QUERY
    -- Get the onchain profile that matches the account id
    WITH onchain_profiles_ids AS (
        SELECT op.*
        FROM onchain_profiles op
        WHERE op.account_id = e_row.id
    )
    SELECT e.*
    FROM entities e
    -- Return the entity id that matches the onchain profile id
    INNER JOIN onchain_profiles_ids opids ON e.id = opids.id;
END;
$$ LANGUAGE plpgsql STRICT STABLE;

ALTER TABLE
    public.relations DISABLE TRIGGER ALL;
