import { publicOperationSchemas } from './contracts/public-api.js';

export function searchArguments(args: string[]) {
  const words: string[] = [];
  const options: { preference?: number; maxEffectivePriceMicros?: string; limit?: number } = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === '--preference' || flag === '--max-effective-price-micros' || flag === '--limit') {
      const value = args[++index];
      const name = flag === '--preference' ? 'preference' : flag === '--limit' ? 'limit' : 'maxEffectivePriceMicros';
      if (options[name] !== undefined || !value || value.startsWith('--'))
        throw new Error(`Supply ${flag} once, followed by its value`);
      if (name === 'maxEffectivePriceMicros') options[name] = value;
      else options[name] = Number(value);
    } else if (flag.startsWith('--')) throw new Error(`Unknown search flag: ${flag}. Use o11 discover --provider KEY for a named provider.`);
    else words.push(flag);
  }
  return publicOperationSchemas.search_tools.parse({ request: words.join(' '), ...options });
}
