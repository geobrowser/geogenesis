import { Effect } from 'effect';
import { loadSync } from 'protobufjs';

import { ZodEdit, ZodEditorshipProposal, ZodMembershipProposal, ZodSubspaceProposal } from './parser';
import { deserialize } from '~/sink/proto';

export const handleDecodeEditProposal = (buffer: Buffer) =>
  Effect.gen(function* (_) {
    const root = loadSync('schema.proto');
    const Edit = root.lookupType('Edit');

    const deserializedData = deserialize(buffer, Edit);
    const data = ZodEdit.safeParse(deserializedData);

    if (data.success) {
      return data.data;
    }

    return null;
  });

export const handleDecodeMembershipProposal = (buffer: Buffer) =>
  Effect.gen(function* (_) {
    const root = loadSync('schema.proto');
    const Edit = root.lookupType('Membership');

    const deserializedData = deserialize(buffer, Edit);
    const data = ZodMembershipProposal.safeParse(deserializedData);

    if (data.success) {
      return data.data;
    }

    return null;
  });

export const handleDecodeEditorshipProposal = (buffer: Buffer) =>
  Effect.gen(function* (_) {
    const root = loadSync('schema.proto');
    const Edit = root.lookupType('Editorship');

    const deserializedData = deserialize(buffer, Edit);
    const data = ZodEditorshipProposal.safeParse(deserializedData);

    if (data.success) {
      return data.data;
    }

    return null;
  });

export const handleDecodeSubspaceProposal = (buffer: Buffer) =>
  Effect.gen(function* (_) {
    const root = loadSync('schema.proto');
    const Edit = root.lookupType('Subspace');

    const deserializedData = deserialize(buffer, Edit);
    const data = ZodSubspaceProposal.safeParse(deserializedData);

    if (data.success) {
      return data.data;
    }

    return null;
  });
