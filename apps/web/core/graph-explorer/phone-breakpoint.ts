/**
 * The graph explorer's one phone breakpoint (GEO-3849). The map reads it in JS (`useMediaQuery`) for
 * its phone layout and caps; the CSS reads it through the `graph-phone:` / `graph-wide:` variants in
 * `styles/styles.css`, which must spell this exact query (a test pins them). Use those variants for any
 * graph-explorer rule that has to switch with the map, never an ad-hoc `max-[…]:` / `min-[…]:`.
 */
export const GRAPH_PHONE_QUERY = '(max-width: 599px)';
