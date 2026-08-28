/**
 * The look of a control sitting directly in a data block row: size, resting grey, hover colour.
 *
 * Shared so the controls beside each other look like each other rather than merely near each other.
 * It lives on its own rather than in the component that first needed it, because that component is
 * routinely stubbed in tests and a style constant should not disappear with it.
 */
export const rowOpenerClassName =
  'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-none bg-transparent p-0 text-grey-03 transition duration-300 ease-in-out hover:text-text focus:outline-hidden';
