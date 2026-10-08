/** The surface every debate action shares: white, hairline border, light shadow. */
const ACTION_SURFACE_CLASS = 'border bg-white shadow-light';

/** An action's resting and hover colours. Left off by indicators, which are not controls. */
const ACTION_COLOR_CLASS = 'border-grey-02 text-grey-04 transition-colors hover:text-text';

/**
 * The pill a debate's actions are cut from, without an action's colours, for the rounds pill that
 * sits among them but does nothing (GEO-3180).
 */
export const PILL_SHAPE_CLASS = `flex h-7 items-center rounded-full ${ACTION_SURFACE_CLASS}`;

/**
 * The white pill a debate's actions wear: the claims, comments and share pills under the video, and
 * the end card's replay.
 *
 * Shared so the replay reads as one of the debate's actions and cannot drift from the pills it is
 * drawn to match. Layout only — each caller sets its own gap, padding and type.
 */
export const PILL_ACTION_CLASS = `${PILL_SHAPE_CLASS} ${ACTION_COLOR_CLASS}`;

/** The circle the full-screen rail's actions are cut from; see {@link PILL_SHAPE_CLASS}. */
export const CIRCLE_SHAPE_CLASS = `grid size-9 place-items-center rounded-full ${ACTION_SURFACE_CLASS}`;

/** The rail's circular actions — vote-adjacent comments, claims, share and the overflow menu. */
export const CIRCLE_ACTION_CLASS = `${CIRCLE_SHAPE_CLASS} ${ACTION_COLOR_CLASS}`;
