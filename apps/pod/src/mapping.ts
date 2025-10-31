import {Id} from "@graphprotocol/grc-20"
import type {Mapping} from "@graphprotocol/hypergraph"

export const mapping: Mapping.Mapping = {
	Image: {
		typeIds: [Id("ba4e4146-0010-499d-a0a3-caaa7f579d0e") as any],
		properties: {
			url: Id("8a743832-c094-4a62-b665-0c3cc2f9c7bc") as any,
		},
	},
	Person: {
		typeIds: [Id("7ed45f2b-c48b-419e-8e46-64d5ff680b0d") as any],
		properties: {
			name: Id("a126ca53-0c8e-48d5-b888-82c734c38935") as any,
		},
		relations: {
			avatar: Id("1155beff-fad5-49b7-a2e0-da4777b8792c") as any,
		},
	},
	Podcast: {
		typeIds: [Id("69732974-c632-490d-81a3-12ea567b2a8e") as any],
		properties: {
			name: Id("a126ca53-0c8e-48d5-b888-82c734c38935") as any,
			description: Id("9b1f76ff-9711-404c-861e-59dc3fa7d037") as any,
			dateFounded: Id("41aa3d98-47b6-4a97-b7ec-427e575b910e") as any,
			rssFeedUrl: Id("4dd1a486-c1ad-48c6-b261-e4c8edf7ac65") as any,
		},
		relations: {
			hosts: Id("5e3cc744-6e2f-4393-b1d6-d1ba577a2082") as any,
			avatar: Id("1155beff-fad5-49b7-a2e0-da4777b8792c") as any,
		},
	},
	Episode: {
		typeIds: [Id("11feb0f9-fb3b-442c-818a-b5e97ffde26a") as any],
		properties: {
			name: Id("a126ca53-0c8e-48d5-b888-82c734c38935") as any,
			description: Id("9b1f76ff-9711-404c-861e-59dc3fa7d037") as any,
			airDate: Id("253a0604-c129-4941-a4ad-07284971666b") as any,
			duration: Id("fc52bf99-471b-42e0-8635-99361b6bf83f") as any,
			audioUrl: Id("b5e70601-c985-4135-a5a0-7990b238a676") as any,
			episodeNumber: Id("54abe3ac-f2ac-416a-933d-8357831dff70") as any,
		},
		relations: {
			hosts: Id("5e3cc744-6e2f-4393-b1d6-d1ba577a2082") as any,
			guests: Id("0575795a-d58f-4c46-884f-e454cf9762ea") as any,
			avatar: Id("1155beff-fad5-49b7-a2e0-da4777b8792c") as any,
			podcast: Id("09ed1fd1-aced-469e-98d5-f036e6aa29c8") as any,
			contributors: Id("c25ef1c6-8ba2-42c0-98cf-e2d2e052039d") as any,
		},
	},
	Topic: {
		typeIds: [Id("5ef5a586-0f27-4d8e-8f6c-59ae5b3e89e2") as any],
		properties: {
			name: Id("a126ca53-0c8e-48d5-b888-82c734c38935") as any,
		},
		relations: {
			avatar: Id("1155beff-fad5-49b7-a2e0-da4777b8792c") as any,
		},
	},
}
