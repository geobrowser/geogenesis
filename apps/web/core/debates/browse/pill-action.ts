/** The surface every debate action shares: white, hairline border, light shadow. */
const ACTION_SURFACE_CLASS = 'border bg-white shadow-light';

/** An action's resting and hover colours. */
const ACTION_COLOR_CLASS = 'border-grey-02 text-grey-04 transition-colors hover:text-text';

/** The pill a debate's actions are cut from, without an action's colours. */
const PILL_SHAPE_CLASS = `flex h-7 items-center rounded-full ${ACTION_SURFACE_CLASS}`;

/**
 * The white pill a debate's actions wear: the comments, share and overflow pills on the debate card,
 * and the end card's replay.
 *
 * Shared so the replay reads as one of the debate's actions and cannot drift from the pills it is
 * drawn to match. Layout only — each caller sets its own gap, padding and type.
 */
export const PILL_ACTION_CLASS = `${PILL_SHAPE_CLASS} ${ACTION_COLOR_CLASS}`;
