/**
 * The value a server component should read for a query parameter, matching what the client's
 * `useSearchParams().get()` returns for the same URL.
 *
 * Next hands a server component `string | string[] | undefined`, because a parameter can repeat.
 * The obvious reading — `typeof value === 'string' ? value : undefined` — quietly turns a repeated
 * parameter into "absent", which is usually the opposite of what the URL says. On the space page
 * that made `?tabId=a&tabId=b` read as Overview on the server while the client, reading the same
 * URL through `useSearchParams`, rendered the tab: two halves of one page disagreeing about which
 * page it was.
 *
 * One caller today. It is a function rather than a line at that call site because the wrong version
 * is the one that looks right, and the next server component to read a parameter will reach for it.
 */
export function firstSearchParamValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
