// Allow side-effect CSS imports (e.g. `import '@lumina/ui/styles.css'`) under `tsc --noEmit`.
// Next.js handles the actual bundling; this only satisfies the type-checker.
declare module '*.css';
