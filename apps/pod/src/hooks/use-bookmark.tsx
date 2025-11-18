import {useCreateEntity, useDeleteEntity, useQuery} from "@graphprotocol/hypergraph-react"
import React from "react"
import {Bookmark, BookmarkType} from "@/schema"

export const useBookmark = (showId: string, type: BookmarkType) => {
	const createBookmark = useCreateEntity(Bookmark, {
		space: "c091c97b-c445-40c3-910d-5d36120a0c1b",
	})

	const deleteBookmark = useDeleteEntity({
		space: "c091c97b-c445-40c3-910d-5d36120a0c1b",
	})

	const {data: maybeBookmarkList} = useQuery(Bookmark, {
		mode: "private",
		space: "c091c97b-c445-40c3-910d-5d36120a0c1b",
		filter: {
			bookmarkedId: {
				is: showId,
			},
			bookmarkType: {
				is: type,
			},
		},
	})

	const maybeBookmark = maybeBookmarkList[0] ? maybeBookmarkList[0] : null

	// @TODO: Space not found or not ready
	const onBookmark = React.useCallback(
		async (bookmark: Bookmark) => {
			console.log({maybeBookmark, bookmark})
			if (maybeBookmark) {
				return await deleteBookmark(maybeBookmark.id)
			}

			const result = await createBookmark(bookmark)
			console.log("result", {result})
			return result
		},
		[maybeBookmark, deleteBookmark, createBookmark],
	)

	console.log("whats happening", {maybeBookmark})

	return {
		bookmark: maybeBookmark,
		onBookmark,
	}
}
