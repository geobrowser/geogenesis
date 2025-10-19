type SavedItem =
	| {
			type: "show"
			showId: string
	  }
	| {
			type: "episode"
			episodeId: string
	  }
	| {
			type: "topic"
			topicId: string
	  }
	| {
			type: "people"
			personId: string
	  }

export const savedItems: SavedItem[] = [
	{
		type: "show",
		showId: "ft-news",
	},
	{
		type: "show",
		showId: "the-journal",
	},
	{
		type: "show",
		showId: "pod-save-america",
	},
	{
		type: "show",
		showId: "the-daily",
	},
	{
		type: "show",
		showId: "bloomberg-tech",
	},
	{
		type: "show",
		showId: "red-web",
	},
	{
		type: "episode",
		episodeId: "episode-1",
	},
	{
		type: "episode",
		episodeId: "episode-4",
	},
	{
		type: "episode",
		episodeId: "episode-12",
	},
	{
		type: "episode",
		episodeId: "episode-23",
	},
	{
		type: "episode",
		episodeId: "episode-47",
	},
	{
		type: "episode",
		episodeId: "episode-75",
	},
	{
		type: "episode",
		episodeId: "episode-101",
	},
	{
		type: "topic",
		topicId: "crime",
	},
	{
		type: "topic",
		topicId: "technology",
	},
	{
		type: "topic",
		topicId: "business",
	},
	{
		type: "topic",
		topicId: "health",
	},
	{
		type: "topic",
		topicId: "comedy",
	},
	{
		type: "people",
		personId: "alex-thompson",
	},
	{
		type: "people",
		personId: "sarah-chen",
	},
	{
		type: "people",
		personId: "emma-rodriguez",
	},
	{
		type: "people",
		personId: "david-kim",
	},
	{
		type: "people",
		personId: "priya-patel",
	},
	{
		type: "people",
		personId: "marcus-johnson",
	},
	{
		type: "people",
		personId: "maya-nakamura",
	},
]
