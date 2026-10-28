/**
 * jsdom ships no `ResizeObserver`, and Radix's poppers, the hub's menus and the Requests timeline
 * all construct one. One stand-in for every suite, rather than a copy per file.
 *
 * It also remembers what it was asked to watch, so a test can find the observer on an element and
 * say "this just changed size" (`fireResize`) — jsdom lays nothing out, so nothing else ever will.
 */
export class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  readonly targets = new Set<Element>();

  constructor(private readonly callback?: ResizeObserverCallback) {
    ResizeObserverStub.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  /** Runs the callback, as a browser would once a watched element has been laid out again. */
  fire() {
    this.callback?.([...this.targets].map(target => ({ target }) as ResizeObserverEntry), this as never);
  }
}

/** The observers still watching something: connected, and not yet disconnected. */
export function activeResizeObservers() {
  return ResizeObserverStub.instances.filter(observer => observer.targets.size > 0);
}

/** Every observer watching `target`, or any element at all when none is named, fired once. */
export function fireResize(target?: Element) {
  for (const observer of activeResizeObservers()) {
    if (!target || observer.targets.has(target)) observer.fire();
  }
}
