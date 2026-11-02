import * as React from 'react';

/**
 * True from the first render `condition` holds, and from then on. Used to mount something on demand
 * and then leave it mounted, so its state and exit animation survive the condition going false.
 */
export function useSticky(condition: boolean): boolean {
  const [seen, setSeen] = React.useState(condition);
  if (condition && !seen) setSeen(true);
  return seen || condition;
}
