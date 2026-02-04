# Data Fetching Layer

This directory contains data fetching functions that retrieve data from various sources.

## Note on Directory Name

Despite the directory name `subgraph`, this module contains both:

1. **REST API calls** (to gaia backend):
   - `fetch-profile.ts` - Profile fetching via REST
   - `fetch-proposal.ts` - Single proposal fetching via REST
   - `fetch-proposals.ts` - Proposal list fetching via REST
   - `fetch-completed-proposals.ts` - Completed proposals via REST

2. **GraphQL calls** (to subgraph):
   - `fetch-history-versions.ts`
   - `fetch-versions-batch.ts`
   - `fetch-subspaces.ts`
   - Other legacy GraphQL-based fetchers

This naming is a historical artifact from the migration to REST APIs.
The shared schemas and utilities for REST API calls are located in `../rest/`.

## Shared Schemas

All REST API schemas are centralized in `../rest/schemas/` to avoid duplication:

- `../rest/schemas/proposal.ts` - Proposal-related schemas and mappers
- `../rest/schemas/profile.ts` - Profile-related schemas

Import from `~/core/io/rest` to access these schemas.
