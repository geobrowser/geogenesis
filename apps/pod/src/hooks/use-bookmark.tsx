import {useCreateEntity, useDeleteEntity, useQuery} from "@graphprotocol/hypergraph-react"
import React from "react"
import {BOOKMARK_SPACE_ID} from "@/config"
import {Bookmark, BookmarkType} from "@/schema"

export const useBookmark = (showId: string, type: BookmarkType) => {
	const createBookmark = useCreateEntity(Bookmark, {
		space: BOOKMARK_SPACE_ID,
	})

	const deleteBookmark = useDeleteEntity({
		space: BOOKMARK_SPACE_ID,
	})

	const {data: maybeBookmarkList} = useQuery(Bookmark, {
		mode: "private",
		space: BOOKMARK_SPACE_ID,
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
			if (maybeBookmark) {
				return await deleteBookmark(maybeBookmark.id)
			}

			const result = await createBookmark(bookmark)
			return result
		},
		[maybeBookmark, deleteBookmark, createBookmark],
	)

	return {
		bookmark: maybeBookmark,
		onBookmark,
	}
}
