DO $$ 
DECLARE 
    _tbl text; 
BEGIN 
    FOR _tbl IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP 
        RAISE NOTICE 'Clearing table %', _tbl;
        EXECUTE format('DELETE FROM public.%I CASCADE;', _tbl); 
    END LOOP; 
END $$;


