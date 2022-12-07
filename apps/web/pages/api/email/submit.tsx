import { NextApiRequest, NextApiResponse } from 'next'
import mailchimp from '@mailchimp/mailchimp_marketing'

mailchimp.setConfig({
	apiKey: process.env.MAILCHIMP_API_KEY,
	server: process.env.MAILCHIMP_API_SERVER,
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const address = req.query.address as string

	if (!address) {
		return res.status(400).json({ address })
	}

	try {
		await mailchimp.lists.addListMember(process.env.MAILCHIMP_AUDIENCE_ID!, {
			email_address: address,
			status: 'subscribed',
		})

		return res.status(201).json({ address })
	} catch (error) {
		return res.status(500).json({ address: null })
	}
}
