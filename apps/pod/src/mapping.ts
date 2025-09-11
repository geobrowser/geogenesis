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
	Episode: {
		typeIds: [Id("aba2df6e-19d8-46a0-8e35-e97fd25ed9a0")],
		properties: {
			name: Id("a126ca53-0c8e-48d5-b888-82c734c38935"),
			description: Id("9b1f76ff-9711-404c-861e-59dc3fa7d037"),
			airDate: Id("0ea7f892-ba89-4593-83ed-c26ff212168d"),
			duration: Id("d4d07369-022a-4698-9a7b-21d219cbf8be")
		},
		relations: {
			hosts: Id("3b9c342d-0da0-42fb-80e5-549ac674a84f"),
			guests: Id("0575795a-d58f-4c46-884f-e454cf9762ea"),
			avatar: Id("1155beff-fad5-49b7-a2e0-da4777b8792c"),
			podcast: Id("71c1575f-0b6f-4b94-97fc-1a2b60d8195b")
		},
	},
}
