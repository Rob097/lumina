/**
 * @lumina/shared — the wire contract.
 *
 * Zod schemas + inferred TS types + constants shared by the widget, the API, and the dashboard.
 * One definition per concept; never duplicate a type across planes (CLAUDE.md HARD RULE #6).
 */
export * from './enums.js';
export * from './errors.js';
export * from './events.js';
export * from './product.js';
export * from './config.js';
export * from './widget.js';
export * from './generate.js';
export * from './plans.js';
export * from './account.js';
