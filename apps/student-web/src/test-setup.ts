import '@testing-library/jest-dom';

// jsdom lacks ResizeObserver — Radix primitives (Slider/Select/Dialog) measure
// their geometry with it. A no-op observer keeps them rendering in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() { /* no-op */ }
    unobserve() { /* no-op */ }
    disconnect() { /* no-op */ }
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}

// Radix Select/Dialog portal into document.body — keep RTL's screen queries happy.
if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  (globalThis as unknown as { DOMMatrixReadOnly: object }).DOMMatrixReadOnly = class DOMMatrixReadOnly {
    constructor() { /* no-op */ }
  };
}

// jsdom lacks scrollIntoView — Radix Select scrolls the highlighted/selected item
// into view whenever the open list mounts or the value changes.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => { /* no-op */ };
}
