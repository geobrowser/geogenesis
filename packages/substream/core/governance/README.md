The governance module handles consuming the ordered substream, the read-ahead node, and writes the data to the DB for governance-related data.

To start we won't read from the read-ahead node and instead fetch from IPFS as part of the KG indexer.
