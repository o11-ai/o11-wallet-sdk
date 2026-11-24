/**
 * `--block NAME` (repeatable) on `create-card` and `update-card`: a provider (`apollo`) or exact tool id
 * (`apollo.people.search`) the card may never use. Added to any `blockedToolIds` in the JSON input.
 */
export function cardBlockFlags(values: readonly string[]) {
  const rest: string[] = [], blocked: string[] = [];
  for (let index = 0; index < values.length; index++) {
    if (values[index] !== '--block') { rest.push(values[index]!); continue; }
    const name = values[++index]?.trim();
    if (!name || name.startsWith('--')) throw new Error('--block takes a provider or tool id, such as --block apollo');
    blocked.push(name);
  }
  return { rest, blocked };
}

/** The JSON input with the `--block` names added to its `blockedToolIds`. */
export function withCardBlocks(input: unknown, blocked: readonly string[]): unknown {
  if (!blocked.length || typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  const listed = Array.isArray(record.blockedToolIds) ? record.blockedToolIds : [];
  return { ...record, blockedToolIds: [...listed, ...blocked] };
}
