import {Entity, Type} from "@graphprotocol/hypergraph"

export enum BookmarkType {
	Show = "show",
	Episode = "episode",
}

export class Bookmark extends Entity.Class<Bookmark>("Bookmark")({
	bookmarkType: Type.String, // show || episode || person || topic
	bookmarkedId: Type.String,
}) {}
