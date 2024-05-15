import fs from 'fs';

import { Edit, IpfsContentType, IpfsMetadata } from '../proto';

const writeMetadata = (type: IpfsContentType, name: string) => {
  const metadata = new Edit({
    name: name,
    type: type,
    version: '0.0.1',
    proposalId: '-1',
  });

  const binary = metadata.toBinary();
  fs.writeFileSync(`./test-${name}-proposal.pb`, binary);
};

writeMetadata(IpfsContentType.EDIT, 'Edit');
