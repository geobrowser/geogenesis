import {Id} from "@graphprotocol/grc-20"
import type {Mapping} from "@graphprotocol/hypergraph"

export const mapping: Mapping.Mapping = {
	Person: {
		typeIds: [Id("7ed45f2b-c48b-419e-8e46-64d5ff680b0d")],
		properties: {
			name: Id('a126ca53-0c8e-48d5-b888-82c734c38935')
		}
	},
	Podcast: {
		typeIds: [Id("770b338e-d13b-4e9f-9db2-c85a9473ce8a")],
		properties: {
			name: Id('a126ca53-0c8e-48d5-b888-82c734c38935'),
			description: Id('9b1f76ff-9711-404c-861e-59dc3fa7d037'),
			dateFounded: Id("41aa3d98-47b6-4a97-b7ec-427e575b910e")
		},
		relations: {
			['3b9c342d-0da0-42fb-80e5-549ac674a84f']: Id("7ed45f2b-c48b-419e-8e46-64d5ff680b0d")
		}
	}
}
