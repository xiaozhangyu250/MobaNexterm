// Thin typed wrapper around window.api / window.events injected by preload.
// Renderer code should import from here, never touch window.* directly.

export const api = window.api;
export const events = window.events;
