// Browser APIs referenced at module scope by dependencies (e.g. @dnd-kit/dom's
// ResizeNotifier extends ResizeObserver) that don't exist in the node/jsdom
// test environment. Stubbed globally so importing UI components in tests works.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
