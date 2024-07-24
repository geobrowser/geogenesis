'use client';

import { IpfsClient } from '~/core/io/ipfs-client';

export default function Page() {
  const upload = async () => {
    const binary = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = await IpfsClient.upload(binary);
    console.log(hash);
  };

  return <button onClick={upload}>Upload</button>;
}
