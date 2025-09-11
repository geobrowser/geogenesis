import {Id} from "@graphprotocol/grc-20"
import type {Mapping} from "@graphprotocol/hypergraph"

export const mapping: Mapping.Mapping = {
	Image: {
    typeIds: [Id('ba4e4146-0010-499d-a0a3-caaa7f579d0e')],
    properties: {
      url: Id('8a743832-c094-4a62-b665-0c3cc2f9c7bc'),
    },
  },
	Person: {
		typeIds: [Id("7ed45f2b-c48b-419e-8e46-64d5ff680b0d")],
		properties: {
			name: Id("a126ca53-0c8e-48d5-b888-82c734c38935"),
		},
		relations: {
			avatar: Id("1155beff-fad5-49b7-a2e0-da4777b8792c"),
		},
	},
	Podcast: {
		typeIds: [Id("770b338e-d13b-4e9f-9db2-c85a9473ce8a")],
		properties: {
			name: Id("a126ca53-0c8e-48d5-b888-82c734c38935"),
			description: Id("9b1f76ff-9711-404c-861e-59dc3fa7d037"),
			dateFounded: Id("41aa3d98-47b6-4a97-b7ec-427e575b910e"),
		},
		relations: {
			hosts: Id("3b9c342d-0da0-42fb-80e5-549ac674a84f"),
			avatar: Id("1155beff-fad5-49b7-a2e0-da4777b8792c"),
		},
	},
}
