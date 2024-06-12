import { Effect } from 'effect';
import fs from 'fs';
import { describe, it } from 'vitest';

import { Edit, IpfsContentType, IpfsMetadata, Membership, Subspace } from '../proto';
import { decode } from './decoder';

describe('decode IpfsContent', () => {
  it('decodes parsed IpfsMetadata protobuf correctly', () => {
    const fileContents = fs.readFileSync('./sink/proto/test-edit-proposal.pb');
    const result = Effect.runSync(decode(() => IpfsMetadata.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result).toMatchSnapshot();
  });
});

describe('decode Edit', () => {
  it('decodes parsed EDIT protobuf correctly', () => {
    const fileContents = fs.readFileSync('./sink/proto/test-edit-proposal.pb');
    const result = Effect.runSync(decode(() => Edit.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result?.type).toBe(IpfsContentType.EDIT);
    expect(result?.name).toBe('Edit');
    expect(result).toMatchSnapshot();
  });
});

describe('decode Membership', () => {
  it('decodes parsed ADD_EDITOR protobuf correctly', () => {
    const fileContents = fs.readFileSync('./sink/proto/test-add-editor-proposal.pb');
    const result = Effect.runSync(decode(() => Membership.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result?.type).toBe(IpfsContentType.ADD_EDITOR);
    expect(result?.name).toBe('Add editor');
    expect(result?.userAddress).toBe('0x1234');
    expect(result).toMatchSnapshot();
  });

  it('decodes parsed REMOVE_EDITOR protobuf correctly', () => {
    const fileContents = fs.readFileSync('./sink/proto/test-remove-editor-proposal.pb');
    const result = Effect.runSync(decode(() => Membership.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result?.type).toBe(IpfsContentType.REMOVE_EDITOR);
    expect(result?.name).toBe('Remove editor');
    expect(result?.userAddress).toBe('0x1234');
    expect(result).toMatchSnapshot();
  });

  it('decodes parsed ADD_MEMBER protobuf correctly', () => {
    const fileContents = fs.readFileSync('./sink/proto/test-add-member-proposal.pb');
    const result = Effect.runSync(decode(() => Membership.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result?.type).toBe(IpfsContentType.ADD_MEMBER);
    expect(result?.name).toBe('Add member');
    expect(result?.userAddress).toBe('0x1234');
    expect(result).toMatchSnapshot();
  });

  it('decodes parsed REMOVE_MEMBER protobuf correctly', () => {
    const fileContents = fs.readFileSync('./sink/proto/test-remove-member-proposal.pb');
    const result = Effect.runSync(decode(() => Membership.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result?.type).toBe(IpfsContentType.REMOVE_MEMBER);
    expect(result?.name).toBe('Remove member');
    expect(result?.userAddress).toBe('0x1234');
    expect(result).toMatchSnapshot();
  });
});

describe('decode Subspace', () => {
  it('decodes parsed ADD_SUBSPACE protobuf correctly', () => {
    const fileContents = fs.readFileSync('./sink/proto/test-add-subspace-proposal.pb');
    const result = Effect.runSync(decode(() => Subspace.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result?.type).toBe(IpfsContentType.ADD_SUBSPACE);
    expect(result?.name).toBe('Add subspace');
    expect(result?.subspace).toBe('0x1234');
    expect(result).toMatchSnapshot();
  });

  it('decodes parsed REMOVE_SUBSPACE protobuf correctly', () => {
    const fileContents = fs.readFileSync('./sink/proto/test-remove-subspace-proposal.pb');
    const result = Effect.runSync(decode(() => Subspace.fromBinary(fileContents)));

    expect(result).to.not.be.null;
    expect(result?.type).toBe(IpfsContentType.REMOVE_SUBSPACE);
    expect(result?.name).toBe('Remove subspace');
    expect(result?.subspace).toBe('0x1234');
    expect(result).toMatchSnapshot();
  });
});
