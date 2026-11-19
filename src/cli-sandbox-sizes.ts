/** Text output of `o11 sandbox sizes`: a comparison table, each provider's limits, and the recommendation for a requested size. */
type Row = { provider: string; shape: string; vcpus: number; memoryGb: number; diskGb: number; upToHourly: string; idleHourly?: string; upToStart: string; requires?: string; walletFundable: boolean; cardAllows: boolean };
type Facts = { name: string; maxRuntimeSeconds: Record<string, number>; maxRuntime: string; concurrent: string; persistence: string; startFee: string; included: string; bestFor: string; gpu: string };
type Sizes = { shapes: Row[]; providers: Record<string, Facts>; recommendation: null | Record<string, unknown>; note: string };

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function isSandboxSizes(value: unknown): value is Sizes {
  const data = record(value);
  return Array.isArray(data.shapes) && typeof data.providers === 'object' && typeof data.note === 'string';
}
const duration = (seconds: number) => seconds > 2 * 86_400 && seconds % 86_400 === 0 ? `${seconds / 86_400}d` : seconds % 3600 === 0 ? `${seconds / 3600}h` : `${Math.round(seconds / 60)}m`;
const runtime = (facts: Facts) => Object.entries(facts.maxRuntimeSeconds).map(([plan, seconds]) => `${duration(seconds)} ${plan}`).join(', ');
const table = (rows: string[][]) => {
  const widths = rows[0]!.map((_cell, index) => Math.max(...rows.map(row => row[index]!.length)));
  return rows.map(row => row.map((cell, index) => cell.padEnd(widths[index]!)).join('  ').trimEnd()).join('\n');
};

export function sandboxSizesText(data: Sizes) {
  // Vercel's Enterprise-only sizes (10 to 32 vCPU) fold into one line unless a request asked for them.
  const folded = !data.recommendation ? data.shapes.filter(row => row.provider === 'vercel' && row.vcpus > 8) : [];
  const rows = data.shapes.filter(row => !folded.includes(row));
  const lines = [table([['Provider', 'Shape', 'vCPU', 'RAM', 'Disk', 'GPU', 'Up to $/hour', 'Start, up to', 'Max run', 'Needs'],
    ...rows.map(row => [data.providers[row.provider]?.name ?? row.provider, row.shape, String(row.vcpus), `${row.memoryGb} GB`, `${row.diskGb} GB`, 'none',
      `${row.upToHourly}${row.idleHourly ? ` (idle ${row.idleHourly})` : ''}`, row.upToStart === '$0.000001' ? '<$0.00001' : row.upToStart, data.providers[row.provider] ? runtime(data.providers[row.provider]!) : '',
      [row.requires, row.walletFundable ? '' : 'own account', row.cardAllows ? '' : 'not on this card'].filter(Boolean).join('; ')])])];
  if (folded.length) lines.push(`Vercel Enterprise also has ${folded[0]!.vcpus} to ${folded.at(-1)!.vcpus} vCPUs (even numbers, 2 GB each), up to ${folded[0]!.upToHourly} to ${folded.at(-1)!.upToHourly}/hour.`);
  lines.push('');
  for (const facts of Object.values(data.providers))
    lines.push(`${facts.name}: ${facts.bestFor}`, `  Runs: ${facts.maxRuntime}`, `  At once: ${facts.concurrent}`, `  Kept: ${facts.persistence}`,
      `  Starts: ${facts.startFee}. Included: ${facts.included}`, `  GPU: ${facts.gpu}`);
  const recommendation = data.recommendation;
  if (recommendation) {
    lines.push('');
    if (typeof recommendation.refused === 'string') lines.push(recommendation.refused);
    else {
      const pick = record(recommendation.pick), price = record(pick.price);
      lines.push(`For ${String(recommendation.request)}:`);
      for (const option of Array.isArray(recommendation.perProvider) ? recommendation.perProvider.map(record) : [])
        lines.push(`  ${data.providers[String(option.provider)]?.name ?? String(option.provider)}: ${typeof option.refused === 'string' ? option.refused : `${String(option.shape)}, up to ${String(option.upToRun)} for the run`}`);
      if (typeof pick.refused === 'string') lines.push(`No pick: ${pick.refused}`);
      else if (pick.provider) lines.push(`Pick: ${data.providers[String(pick.provider)]?.name ?? ''} ${String(pick.shape)}. ${String(price.note ?? '')}${typeof pick.reason === 'string' ? ` ${pick.reason}` : ''}${typeof pick.note === 'string' ? ` ${pick.note}` : ''}`,
        `  Create it: o11 sandbox create --provider ${String(pick.provider)} ${Object.entries(record(pick.native)).map(([key, value]) => `--${key} ${String(value)}`).join(' ')}`);
    }
  }
  lines.push('', data.note);
  return lines.join('\n');
}
