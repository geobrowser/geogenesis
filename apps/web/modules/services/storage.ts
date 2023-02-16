export interface IStorageClient {
  /** Upload a JSON-safe object */
  uploadObject(object: unknown): Promise<string>;
  uploadFile(file: File): Promise<string>;
}

export class StorageClient implements IStorageClient {
  constructor(public ipfsUrl: string) {}

  async uploadObject(object: unknown): Promise<string> {
    const blob = new Blob([JSON.stringify(object)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob);

    const url = `${this.ipfsUrl}/api/v0/add`;

    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (response.status >= 300) {
      const text = await response.text();
      console.log(text);
      return text;
    }

    const { Hash } = await response.json();

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
