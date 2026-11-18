import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { publicOperationSchemas, resultRatingIssues } from './contracts/public-api.js';
import type { ToolClient } from './client.js';
import { ToolClientError } from './client-errors.js';

type Rating = z.input<typeof publicOperationSchemas.rate_result>;
const issue = z.enum(resultRatingIssues);
export const rateUsage = 'Use o11 rate ID useful|not-useful [--issue ISSUE] [--fields A,B] [--reason TEXT] [ID useful|not-useful ...], or o11 rate --input FILE|-';

/**
 * Ratings from the command line: one or more `ID useful|not-useful [--issue ISSUE] [--fields A,B] [--reason TEXT]` groups,
 * or `--input FILE|-` with a JSON list of ratings (or `{ "ratings": [...] }`). Checked against the wallet's contract, so a
 * bad rating fails here before anything is sent.
 */
export async function rateArguments(args: readonly string[], stdin: () => Promise<string>): Promise<Rating[]> {
  if (args[0] === '--input') {
    if (args.length !== 2) throw new Error(rateUsage);
    const parsed: unknown = JSON.parse(args[1] === '-' ? await stdin() : await readFile(args[1]!, 'utf8'));
    return publicOperationSchemas.rate_results.parse(Array.isArray(parsed) ? { ratings: parsed } : parsed).ratings;
  }
  const ratings: Rating[] = [];
  for (let index = 0; index < args.length;) {
    const invocationId = args[index], verdict = args[index + 1];
    if (!invocationId || invocationId.startsWith('-') || verdict !== 'useful' && verdict !== 'not-useful') throw new Error(rateUsage);
    const rating: Rating = { invocationId, useful: verdict === 'useful' };
    for (index += 2; args[index]?.startsWith('--'); index += 2) {
      const flag = args[index], value = args[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(rateUsage);
      if (flag === '--reason') rating.reason = value;
      else if (flag === '--fields') rating.fields = value.split(',').map(field => field.trim()).filter(Boolean);
      else if (flag === '--issue') {
        const parsed = issue.safeParse(value);
        if (!parsed.success) throw new Error(`Use --issue ${resultRatingIssues.join('|')}`);
        rating.issue = parsed.data;
      } else throw new Error(rateUsage);
    }
    ratings.push(rating);
  }
  if (!ratings.length) throw new Error(rateUsage);
  return publicOperationSchemas.rate_results.parse({ ratings }).ratings;
}

type RatingClient = Pick<ToolClient, 'rateResult' | 'rateResults'>;
/** What a wallet older than rate_results (or than issue and fields) says, turned into the next step. */
export class RatingUnsupportedError extends Error {}

/**
 * Sends the ratings: one through rate_result, which every wallet serves; several (or --input) in one rate_results request.
 * An older wallet answers 404 for rate_results (it reports bad entries per rating, never with a 404) and 400 for an issue
 * or fields it does not know; both become a plain next step instead of a generic HTTP error.
 */
export async function sendRatings(client: RatingClient, ratings: Rating[], fromInput: boolean) {
  const several = ratings.length > 1 || fromInput;
  try {
    return several ? await client.rateResults({ ratings }) : await client.rateResult(ratings[0]!);
  } catch (error) {
    if (!(error instanceof ToolClientError)) throw error;
    if (several && error.status === 404)
      throw new RatingUnsupportedError('This wallet does not take several ratings at once yet. Rate each call on its own: o11 rate ID useful|not-useful');
    if (error.status === 400 && ratings.some(rating => rating.issue !== undefined || rating.fields !== undefined))
      throw new RatingUnsupportedError('This wallet does not take --issue or --fields yet. Rate without them, and keep the problem in --reason.');
    throw error;
  }
}
