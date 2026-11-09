import { Window } from "happy-dom";

const window = new Window();

Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  CustomEvent: window.CustomEvent,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  StorageEvent: window.StorageEvent,
  localStorage: window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});

Object.assign(global, {
  window,
  document: window.document,
  navigator: window.navigator,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  CustomEvent: window.CustomEvent,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  StorageEvent: window.StorageEvent,
  localStorage: window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { cleanup } = await import("@testing-library/react");
const { afterEach } = await import("bun:test");

afterEach(() => {
  cleanup();
});
