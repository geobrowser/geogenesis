import { Effect } from 'effect';
import fs from 'fs';
import { describe, it } from 'vitest';

import { Edit, IpfsContentType, IpfsMetadata } from '../proto';
import { decode } from './decoder';

const fileContents = fs.readFileSync('./sink/proto/test-edit-proposal.pb');

describe('decode IpfsContent', () => {
  it('decodes parsed IpfsMetadata protobuf correctly', () => {
    const result = Effect.runSync(decode(() => IpfsMetadata.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result).toMatchSnapshot();
  });
});

describe('decode Edit', () => {
  it('decodes parsed Edit protobuf correctly', () => {
    const result = Effect.runSync(decode(() => Edit.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result).toMatchSnapshot();
  });
});
