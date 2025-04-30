The code in /core relates to the rewrite of the data service to a more modular, testable, independently scalable system.

1. Substream consumer: Listens to events, decodes them, reads from IPFS in the case of edits
2. Governance indexer: Reads decoded, governance-related events and writes to a sink
3. Knowledge-graph-related events: Reads decoded, edit-related events and writes to a sink
4. Versioning system (not calling it an indexer): Does what #3 does, but also handles the job of maintaining historical versions of entities/spaces over time.

[ ] Cursor + block number for both IPFS stream + Linear/Ordered stream
[ ] Otel
[X] DB Schema using drizzle
[ ] IPFS cache stream replication/backup
[ ] KG system
[ ] Write mock data that we can use to test kg system
[ ] Governance system
[ ] Write mock data that we can use to test governance system
[ ] Biome
[ ] Parallelize linear stream by queuing events by space

### Benchmarking

**Compute**
Cache took ~1 hour 13 minutes to index from start->end
Indexer took ~53 minutes to index from start->end (includes U.S. Law)
Indexer took ~1 MINUTE 13 SECONDS to index from start->end (does not include U.S. Law)

**Storage**
Cache storage is ~1400MB
Indexer storage (entities only, with U.S. Law) is ~3600MB for 14,348,121 entities
Indexer storage (entities only, without U.S. Law) is ~1800MB for 142,403 entities
