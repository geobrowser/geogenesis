import { Blob } from 'buffer';
import { NextApiRequest, NextApiResponse } from 'next';
import raw from 'raw-body';
import { fetch, FormData } from 'undici';

export const config = {
  api: {
    bodyParser: false,
  },
};

type AddResponse = {
  Hash: string;
  Name: string;
  Size: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = await raw(req);

  const { baseUrl } = req.query;

  if (typeof baseUrl !== 'string') {
    res.status(400).send('Missing baseUrl parameter');
    return;
  }

  // We polyfill `FormData` and the corresponding `fetch` until
  // vercel supports node 18
  const formData = new FormData();
  formData.append('file', new Blob([body]));

  const url = `${baseUrl}/api/v0/add`;

  console.log(`Posting to url`, url);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (response.status >= 300) {
    const text = await response.text();
    res.status(response.status).send(text);
    return;
  }

  const json = await response.json();

  console.log('uploaded', json);

  res.status(200).send((json as AddResponse).Hash);
}
