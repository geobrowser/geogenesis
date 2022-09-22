export interface IStorageClient {
  /** Upload a JSON-safe object */
  uploadObject(object: unknown): Promise<string>;
}

export const StorageClient: IStorageClient = {
  async uploadObject(object) {
    const blob = new Blob([JSON.stringify(object)], { type: 'application/json' });

    const response = await fetch(`/api/ipfs/upload`, {
      method: 'POST',
      body: blob,
    });

    const cidString = await response.text();

    console.log(cidString);

    return cidString;
  },
};
