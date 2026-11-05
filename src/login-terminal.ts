import { createInterface } from 'node:readline/promises';

/** Use the human's controlling terminal, never agent stdin or chat. */
export function openLoginTerminal() {
  if (!process.stdin.isTTY || !process.stderr.isTTY || process.platform === 'win32') return undefined;
  try {
    const input = process.stdin;
    const output = process.stderr;
    return {
      async email(signal: AbortSignal) {
        const reader = createInterface({ input, output });
        try { return (await reader.question('Email: ', { signal })).trim(); }
        finally { reader.close(); }
      },
      async code(signal: AbortSignal) {
        output.write('Enter the six-digit email code (hidden): ');
        input.setRawMode(true);
        input.resume();
        try {
          return await new Promise<string>((resolve, reject) => {
            let value = '';
            const finish = (error?: Error) => {
              input.off('data', data); signal.removeEventListener('abort', abort);
              output.write('\n');
              if (error) reject(error); else resolve(value);
            };
            const abort = () => finish(new Error('Email sign-in cancelled. Run login again when ready.'));
            const data = (chunk: Buffer) => {
              for (const character of chunk.toString()) {
                if (character === '\u0003') { abort(); return; }
                if (character === '\r' || character === '\n') {
                  if (/^[0-9]{6}$/.test(value)) { finish(); return; }
                  output.write('\nEnter exactly six digits: '); value = ''; continue;
                }
                if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
                else if (/^[0-9]$/.test(character) && value.length < 6) value += character;
              }
            };
            input.on('data', data); signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
          });
        } finally { input.setRawMode(false); input.pause(); }
      },
      close() { input.pause(); if ('unref' in input && typeof input.unref === 'function') input.unref(); },
    };
  } catch { return undefined; }
}
