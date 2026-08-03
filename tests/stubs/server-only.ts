/**
 * Stub for Next.js's `server-only` marker.
 *
 * `server-only` is resolved by the Next bundler, not by Vitest, so importing a
 * module that carries the marker would otherwise fail to load in a unit test.
 * Aliasing it to this empty module keeps the marker in the source — where it
 * genuinely prevents a client component from importing the renderer — without
 * making the module untestable.
 */
export {};
