import fs from 'fs';

import { Edit, IpfsContentType, IpfsMetadata, Membership, Subspace } from '../proto';

const writeMetadata = (type: IpfsContentType, name: string) => {
  const metadata = new Membership({
    name: name,
    type: type,
    version: '0.0.1',
    proposalId: '-1',
    userAddress: '0x1234',
  });

  const binary = metadata.toBinary();
  fs.writeFileSync(`./test-${name.split(' ').join('-').toLowerCase()}-proposal.pb`, binary);
};

writeMetadata(IpfsContentType.REMOVE_MEMBER, 'Remove member');
