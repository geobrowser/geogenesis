import { Effect } from 'effect';
import fs from 'fs';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { bootstrapRoot } from '../bootstrap-root';
import { Ops, Proposals, ProposedVersions } from '../db';
import { populateApprovedContentProposal } from '../entries/populate-approved-content-proposal';
import { mapIpfsProposalToSchemaProposalByType } from '../events/proposals-created/map-proposals';
import { type EditProposal } from '../events/proposals-created/parser';
import { getFetchIpfsContentEffect } from '../ipfs';
import { Decoder, Edit, Import, IpfsMetadata, decode } from '../proto';
import type { BlockEvent, Op } from '../types';
import { retryEffect } from '../utils/retry-effect';
import { pool } from '~/sink/utils/pool';

const mockBlock: BlockEvent = {
  blockNumber: 0,
  cursor: '',
  requestId: '-1',
  timestamp: 0,
};

const mockProposal = {
  metadataUri: '',
  startTime: '',
  endTime: '',
  onchainProposalId: '-1',
  pluginAddress: '',
  creator: '0x1234',
  space: '',
};

class CouldNotWriteInitialSpaceProposalsError extends Error {
  _tag: 'CouldNotWriteInitialSpaceProposalsError' = 'CouldNotWriteInitialSpaceProposalsError';
}

function e2e() {
  return Effect.gen(function* (_) {
    const importResult = yield* _(decode(() => Import.fromBinary(fs.readFileSync('./sink/e2e/import.pb'))));
    if (!importResult) return;

    // @TODO
    // 1. Previous contract address
    // 2. type on import
    // 3. type on edit
    const decodeEditEffect = (hash: string) => {
      return Effect.gen(function* (_) {
        const ipfsContent = yield* _(getFetchIpfsContentEffect(hash));
        if (!ipfsContent) return;

        const validIpfsMetadata = yield* _(decode(() => IpfsMetadata.fromBinary(ipfsContent)));
        if (!validIpfsMetadata) return;

        return yield* _(Decoder.decodeEdit(ipfsContent));
      });
    };

    const decodedEdits = yield* _(
      Effect.all(importResult.edits.map(decodeEditEffect), {
        concurrency: 50,
      })
    );

    console.log('decoded edits', decodedEdits);
  });
}

// Effect.runPromise(bootstrapRoot());
Effect.runPromise(e2e());
