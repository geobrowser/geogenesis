/**
 * The id on `CommentSection`'s wrapper — a claim's Activity, every other entity's Comments.
 *
 * One constant because three things have to agree on it: the section that carries it, the links that
 * point at it (`#entity-comments` on an entity URL), and the side panel, which has no URL and scrolls
 * to it by looking it up. Its own module so a card can link to it without importing the section.
 */
export const ENTITY_COMMENTS_ANCHOR_ID = 'entity-comments';
