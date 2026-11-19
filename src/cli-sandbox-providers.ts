import { defaultSandboxProvider, type SandboxProvider } from './contracts/sandboxes.js';

type ProviderInfo = { id: SandboxProvider; name: string; default: boolean; summary: string; useWhen: string; docs: string };
const providers: Omit<ProviderInfo, 'default'>[] = [
  { id: 'e2b', name: 'E2B', docs: 'https://e2b.dev/docs',
    summary: 'Fast-starting VMs from a template: base, code-interpreter-v1, desktop, claude, codex and more.',
    useWhen: 'Most work. You want a ready-made template, outbound rules, or pause that keeps memory and running processes.' },
  { id: 'boat', name: 'Boat', docs: 'https://docs.boat.dev',
    summary: 'Linux VMs from small to xlarge with SSH, a desktop, hosted ports and named snapshots you can share.',
    useWhen: 'You need a bigger or longer-lived machine, SSH, Boat-hosted links, or snapshots shared with another Boat account.' },
  { id: 'vercel', name: 'Vercel Sandbox', docs: 'https://vercel.com/docs/sandbox',
    summary: 'Firecracker VMs billed by active CPU, with drives, sandbox users and a per-domain firewall.',
    useWhen: 'Your app runs on Vercel, you need drives that outlive a sandbox, separate Linux users, or per-domain network rules.' },
];

/** o11 sandbox providers: answered locally, no request. */
export function sandboxProviders() {
  return { default: defaultSandboxProvider, providers: providers.map(row => ({ ...row, default: row.id === defaultSandboxProvider })),
    next: ['o11 sandbox create --name NAME', 'o11 sandbox create --provider boat --name NAME', 'o11 sandbox capabilities --matrix'] };
}
export function sandboxProvidersText() {
  const value = sandboxProviders();
  return [...value.providers.flatMap(row => [`${row.name} (${row.id})${row.default ? ', the default' : ''}`, `  ${row.summary}`, `  Use it when: ${row.useWhen}`, '']),
    `Pick one with --provider ${value.providers.map(row => row.id).join('|')}. Without it, o11 uses ${value.default}.`,
    'Compare every command: o11 sandbox capabilities --matrix'].join('\n');
}

type MatrixCell = { status: string; reason?: string; alternative?: string };
type Matrix = { providers: string[]; rows: (Record<string, unknown> & { command: string; group: string })[] };
const mark: Record<string, string> = { implemented: 'yes', o11_not_implemented: 'not in o11 yet', provider_not_supported: 'no', not_listed: 'unverified' };
const isCell = (value: unknown): value is MatrixCell => Boolean(value && typeof value === 'object' && typeof Reflect.get(value, 'status') === 'string');
export function isSandboxMatrix(value: unknown): value is Matrix {
  return Boolean(value && typeof value === 'object' && Array.isArray(Reflect.get(value, 'providers')) && Array.isArray(Reflect.get(value, 'rows')));
}

/** capabilities --matrix as a table, with each provider gap and its alternative under it. */
export function sandboxMatrixText(matrix: Matrix) {
  const width = Math.max(...matrix.rows.map(row => row.command.length)) + 2;
  const column = Math.max(...Object.values(mark).map(value => value.length), ...matrix.providers.map(id => id.length)) + 2;
  const lines = [`${'command'.padEnd(width)}${matrix.providers.map(id => id.padEnd(column)).join('')}`.trimEnd()];
  const notes: string[] = [];
  for (const row of matrix.rows) {
    const cells = matrix.providers.map(id => { const value = row[id]; return isCell(value) ? value : { status: 'not_listed' }; });
    lines.push(`${row.command.padEnd(width)}${cells.map(value => (mark[value.status] ?? value.status).padEnd(column)).join('')}`.trimEnd());
    const note = Reflect.get(row, 'note'); if (typeof note === 'string') notes.push(`${row.command}: ${note}`);
    cells.forEach((value, index) => {
      if (value.status === 'implemented' || !value.reason && !value.alternative) return;
      notes.push(`${row.command} on ${matrix.providers[index]}: ${[value.reason, value.alternative].filter(Boolean).join(' ')}`);
    });
  }
  return [...lines, '', ...notes].join('\n');
}
