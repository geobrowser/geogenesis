DO $$ 
DECLARE 
    _tbl text; 
BEGIN 
    FOR _tbl IN (SELECT tablename FROM pg_tables WHERE schemaname = 'cache') 
    LOOP 
        RAISE NOTICE 'Clearing table %', _tbl;
        EXECUTE format('DELETE FROM cache.%I CASCADE;', _tbl); 
    END LOOP; 
END $$;


