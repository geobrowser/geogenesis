import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const address = req.query.address as string;

  res.status(200).json({ address });
}
