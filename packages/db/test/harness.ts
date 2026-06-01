// The harness now lives in `src/testing.ts` and is published as `@lumina/db/testing` so other
// packages (api, …) can reuse it. Tests in this package import it from here for brevity.
export * from '../src/testing.js';
