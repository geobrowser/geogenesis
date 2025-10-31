import type {Podcast} from "@/schema"

/**
 * Converts a string to a URL-friendly slug
 * @param text - The text to slugify (e.g., "The Joe Rogan Experience")
 * @returns A URL-friendly slug (e.g., "the-joe-rogan-experience")
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "") // Remove non-word chars except spaces and hyphens
		.replace(/[\s_-]+/g, "-") // Replace spaces, underscores, multiple hyphens with single hyphen
		.replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
}

/**
 * Resolves a show slug to its entity ID by searching through all shows.
 *
 * @param slug - The URL slug (e.g., "the-joe-rogan-experience")
 * @param shows - Array of all podcast shows
 * @returns The entity ID or undefined if not found
 */
export function resolveShowSlug(slug: string, shows: Podcast[]): string | undefined {
	const show = shows.find((s) => slugify(s.name) === slug)
	return show ? (show as Podcast & {id: string}).id : undefined
}

/**
 * Generates a slug from a podcast name
 *
 * @param podcast - The podcast entity
 * @returns The URL slug for the podcast
 */
export function getShowSlug(podcast: Podcast): string {
	return slugify(podcast.name)
}
