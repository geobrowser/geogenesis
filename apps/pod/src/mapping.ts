import {Id} from "@graphprotocol/grc-20"
import type {Mapping} from "@graphprotocol/hypergraph"

export const mapping: Mapping.Mapping = {
	Address: {
		typeIds: [Id("5c6e72fb-8340-47c0-8281-8be159ecd495")],
		properties: {
			name: Id("a126ca53-0c8e-48d5-b888-82c734c38935"),
			description: Id("9b1f76ff-9711-404c-861e-59dc3fa7d037"),
		},
	},
	Project: {
		typeIds: [Id("484a18c5-030a-499c-b0f2-ef588ff16d50")],
		properties: {
			name: Id("a126ca53-0c8e-48d5-b888-82c734c38935"),
		},
	},
}
