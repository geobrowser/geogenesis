import fs from 'fs';

import { Edit, EditLegacy, IpfsContentType, IpfsMetadata, Membership, Subspace } from '../proto';
import { createGeoId } from '../utils/create-geo-id';

const write = (type: IpfsContentType, name: string) => {
  const legacy = EditLegacy.fromBinary(fs.readFileSync('data-2.pb'));

  console.log('legacy', JSON.stringify(legacy, null, 2));

  const metadata = new Edit({
    name: name,
    type: type,
    version: '1.0.0',
    proposalId: createGeoId(),
    authors: legacy.authors,
    ops: legacy.ops,
  });

  const binary = metadata.toBinary();
  fs.writeFileSync('data-2-with-new-schema.pb', binary);
  // fs.writeFileSync(`./test-${name.split(' ').join('-').toLowerCase()}-proposal.pb`, binary);
};

const read = () => {
  const data = Edit.fromBinary(fs.readFileSync('data-2-with-new-schema.pb'));
  console.log('read data', JSON.stringify(data.name, null, 2));
};

write(IpfsContentType.EDIT, `${new Date().toString()}: Edit test with new schema`);
// read();
