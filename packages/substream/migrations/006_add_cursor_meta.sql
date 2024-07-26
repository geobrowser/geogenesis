ALTER TABLE public.cursors
ADD COLUMN block_hash text NOT NULL,
ADD COLUMN block_timestamp integer NOT NULL;
