import '@testing-library/jest-dom/extend-expect';

import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import matchers from '@testing-library/jest-dom/matchers';

// extends Vitest's expect method with methods from react-testing-library
expect.extend(matchers);

// runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});

// JSDOM doesn't implement PointerEvent so we need to mock our own implementation
// Default to mouse left click interaction
// https://github.com/radix-ui/primitives/issues/1207
// https://github.com/jsdom/jsdom/pull/2666
class MockPointerEvent extends Event {
  button: number;
  ctrlKey: boolean;
  pointerType: string;

  constructor(type: string, props: PointerEventInit) {
    super(type, props);
    this.button = props.button || 0;
    this.ctrlKey = props.ctrlKey || false;
    this.pointerType = props.pointerType || 'mouse';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.PointerEvent = MockPointerEvent as any;

// https://github.com/radix-ui/primitives/issues/420#issuecomment-771615182
class ResizeObserver {
  cb;

  constructor(cb: () => void) {
    this.cb = cb;
  }
  observe() {
    //
  }
  unobserve() {
    //
  }
  disconnect() {
    //
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.ResizeObserver = ResizeObserver as any;
