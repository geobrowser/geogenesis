/** console.info gated to development — for verbose observability logs. */
export function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV === 'development') console.info(...args);
}
