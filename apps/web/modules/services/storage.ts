export interface IStorageClient {
  /** Upload a JSON-safe object */
  uploadObject(object: unknown): Promise<string>;
  uploadFile(file: File): Promise<string>;
}

export class StorageClient implements IStorageClient {
  constructor(public ipfsUrl: string) {}

  async uploadObject(object: unknown): Promise<string> {
    const blob = new Blob([JSON.stringify(object)], { type: 'application/json' });

    const params = new URLSearchParams({ baseUrl: this.ipfsUrl });

    const response = await fetch(`/api/ipfs/upload?${params.toString()}`, {
      method: 'POST',
      body: blob,
    });

    const cidString = await response.text();

    console.log(cidString);

    return cidString;
  }

  async uploadFile(file: File): Promise<string> {
    const params = new URLSearchParams({ baseUrl: this.ipfsUrl });

    const response = await fetch(`/api/ipfs/upload-file?${params.toString()}`, {
      method: 'POST',
      body: file,
    });

    const cidString = await response.text();

    console.log(cidString);

    return cidString;
  }
}
