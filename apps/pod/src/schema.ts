import {Entity, Type} from "@graphprotocol/hypergraph"

export enum BookmarkType {
	Show = "show",
	Episode = "episode",
}

export class Bookmark extends Entity.Class<Bookmark>("Bookmark")({
	bookmarkType: Type.String, // show || episode || person || topic
	bookmarkedId: Type.String,
}) {}

export class Person extends Entity.Class<Person>("Person")({
	name: Type.String,
}) {} 

export class Podcast extends Entity.Class<Podcast>("Podcast")({
	name: Type.String,
	description: Type.optional(Type.String),
	hosts: Type.Relation(Person),
	dateFounded: Type.Date,
}) {}