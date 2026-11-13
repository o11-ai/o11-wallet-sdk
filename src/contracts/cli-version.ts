/**
 * The oldest o11 CLI this wallet serves. The setup skill states it, and the API refuses an older CLI with update
 * steps. The CLI names itself in `cliVersionHeader` on every request; a client without the header is not a CLI.
 */
export const minimumCliVersion = "0.1.33";
export const cliVersionHeader = "x-o11-cli-version";

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
/** True when `version` is a valid release older than the minimum; anything unparsable is left to the caller's other checks. */
export function cliTooOld(version: string | undefined | null, minimum = minimumCliVersion) {
  if (!version || !semver.test(version)) return false;
  const left = version.split(".").map(Number), right = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index]! < right[index]!;
  return false;
}

export function cliUpdateSteps(version: string, origin: string) {
  return `This o11 CLI (${version}) is older than this wallet supports (${minimumCliVersion} or newer). Run \`o11 update\`. `
    + `If that fails, reinstall: download ${origin}/downloads/install.sh (install.ps1 on Windows), check it against ${origin}/downloads/checksums.json, `
    + `and run it with O11_WALLET_ORIGIN=${origin}. Nothing was sent or charged.`;
}
