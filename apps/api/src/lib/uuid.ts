const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Return the value if it's a UUID, else undefined (so we never feed bad input to a uuid column). */
export function asUuid(value: string | undefined | null): string | undefined {
  return isUuid(value) ? value : undefined;
}
