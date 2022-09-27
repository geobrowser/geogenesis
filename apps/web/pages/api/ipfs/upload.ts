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

  const { baseUrl } = req.query;

  if (typeof baseUrl !== 'string') {
    res.status(400).send('Missing baseUrl parameter');
    return;
  }

  const formData = new FormData();
  formData.append('file', new Blob([body]));

  const response = await fetch(`${baseUrl}/api/v0/add`, {
    method: 'POST',
    body: formData,
  });

  const json: AddResponse = await response.json();

  console.log('uploaded', json);

  res.status(200).send(json.Hash);
}
