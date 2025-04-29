CREATE TABLE "ipfs_cache" (
	"id" serial NOT NULL,
	"json" jsonb NOT NULL,
	"uri" text NOT NULL,
	"isErrored" boolean DEFAULT false,
	CONSTRAINT "ipfs_cache_uri_unique" UNIQUE("uri")
);
