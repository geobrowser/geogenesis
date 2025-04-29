The code in /core relates to the rewrite of the data service to a more modular, testable, independently scalable system.

1. Substream consumer: Listens to events, decodes them, reads from IPFS in the case of edits
2. Governance indexer: Reads decoded, governance-related events and writes to a sink
3. Knowledge-graph-related events: Reads decoded, edit-related events and writes to a sink
4. Versioning system (not calling it an indexer): Does what #3 does, but also handles the job of maintaining historical versions of entities/spaces over time.

[ ] Biome
[ ] Cursor + block number
[ ] Otel
[ ] DB Schema using drizzle
[ ] Substream consumer independent from other systems

    - should partition events by space
    - should handle parallelizing reading the events by space
    - should handle parallelizing fetching IPFS contents by space

[ ] Update contract events to emit all the data we need and avoid lookups
[ ] Governance system
[ ] Write mock data that we can use to test governance system
[ ] KG system
[ ] Write mock data that we can use to test governance system
