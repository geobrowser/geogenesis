import { createGeoId } from '@geogenesis/sdk';
import fs from 'fs';

import { Edit, EditLegacy, IpfsContentType, IpfsMetadata, Membership, Subspace } from '../proto';

const write = (type: IpfsContentType, name: string, buffer: Buffer) => {
  const legacy = EditLegacy.fromBinary(buffer);

  console.log('legacy', JSON.stringify(legacy, null, 2));

  const metadata = new Edit({
    name: name,
    type: type,
    version: '1.0.0',
    proposalId: createGeoId(),
    authors: legacy.authors,
    ops: legacy.ops,
  });

  console.log('metadata', JSON.stringify(metadata.toJson(), null, 2));

  const binary = metadata.toBinary();
  fs.writeFileSync(`${name.split(' ').join('-').toLowerCase()}.pb`, binary);
};

const read = (buffer: Buffer) => {
  const data = Edit.fromBinary(buffer);
  console.log('read data', JSON.stringify(data.ops, null, 2));
  fs.writeFileSync('ops-1.json', JSON.stringify(data.ops));
};

// write(IpfsContentType.EDIT, 'Edits 1 with new schema', fs.readFileSync('edits_1.pb'));
read(fs.readFileSync('edits-1-with-new-schema.pb'));
