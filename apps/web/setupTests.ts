import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import indexedDB from 'fake-indexeddb';
import { afterEach, vi } from 'vitest';

// Add support for IndexedDB testing
globalThis.indexedDB = indexedDB;

// runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});

vi.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '',
      query: '',
      asPath: '',
      replace: () => {
        //
      },
    };
  },
}));

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

window.ResizeObserver = ResizeObserver as any;
