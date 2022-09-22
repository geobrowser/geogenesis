import { NextApiRequest, NextApiResponse } from 'next';
import raw from 'raw-body';

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

  const formData = new FormData();
  formData.append('file', new Blob([body]));

  const url = `http://localhost:5001/api/v0/add`;
  // const url = `https://api.thegraph.com/ipfs/api/v0/add`;

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  const json: AddResponse = await response.json();

  console.log('uploaded', json);

  res.status(200).send(json.Hash);
}
