The read-ahead module parallelizes reading the substream, fetching IPFS contents, and exposing the fully decoded output to other consumers.

To start this can be an identity module, meaning that we don't actually do any work to read-ahead and instead just return the hash.
