/** Every expected failure carries a stable code that skills can branch on. */
export class OstackError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OstackError";
  }
}
