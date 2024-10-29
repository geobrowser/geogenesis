export class IpfsService {
  constructor(public ipfsUrl: string) {}

  async upload(binary: Uint8Array): Promise<string> {
    const blob = new Blob([binary], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob);
    const url = `${this.ipfsUrl}/api/v0/add`;
    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${process.env.IPFS_KEY}`,
      },
    });

    if (response.status >= 300) {
      const text = await response.text();
      console.log(text);
      return text;
    }

    const { Hash } = await response.json();

    console.log('ipfs hash', Hash);

    return Hash;
  }

  async uploadFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.ipfsUrl}/api/v0/add`;
    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${process.env.IPFS_KEY}`,
      },
    });

    if (response.status >= 300) {
      const text = await response.text();
      console.log(text);
      return text;
    }

    const { Hash } = await response.json();

    return `${this.ipfsUrl}/api/v0/cat?arg=${Hash}`;
  }
}
