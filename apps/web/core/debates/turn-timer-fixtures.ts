/**
 * Records each time `useRestartedEach` restarts an element's animations, for tests: it takes them
 * off and has the browser lay the element out before putting them back, so every layout read is
 * logged with the animation the element had then. A restart logs `'none'`.
 *
 * Call `restore` when done; it puts `offsetWidth` back.
 */
export function recordAnimationRestarts() {
  const restarts: string[] = [];
  const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      restarts.push(this.style.animation);
      return 0;
    },
  });
  return {
    restarts,
    restore() {
      if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
    },
  };
}
