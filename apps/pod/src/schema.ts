import {Entity, Type} from "@graphprotocol/hypergraph"

export enum BookmarkType {
	Show = "show",
	Episode = "episode",
}

export class Bookmark extends Entity.Class<Bookmark>("Bookmark")({
	bookmarkType: Type.String, // show || episode || person || topic
	bookmarkedId: Type.String,
}) {}

export class Image extends Entity.Class<Image>("Image")({
	url: Type.String,
}) {}

export class Person extends Entity.Class<Person>("Person")({
	name: Type.String,
	avatar: Type.Relation(Image),
}) {}

export class Podcast extends Entity.Class<Podcast>("Podcast")({
	name: Type.String,
	description: Type.optional(Type.String),
	dateFounded: Type.Date,
	rssFeedUrl: Type.optional(Type.String),
	avatar: Type.Relation(Image),
	hosts: Type.Relation(Person),
}) {}

export class Episode extends Entity.Class<Episode>("Episode")({
	name: Type.String,
	description: Type.optional(Type.String),
	airDate: Type.Date,
	avatar: Type.Relation(Image),
	duration: Type.Number, // in seconds
	audioUrl: Type.optional(Type.String),
	episodeNumber: Type.optional(Type.Number),
	guests: Type.Relation(Person),
	hosts: Type.Relation(Person),
	podcast: Type.Relation(Podcast),
	contributors: Type.Relation(Person),
}) {}

export class Topic extends Entity.Class<Topic>("Topic")({
	name: Type.String,
	avatar: Type.Relation(Image),
}) {}
