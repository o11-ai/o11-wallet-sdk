import { shellQuote, type SandboxSetupRequest, type sandboxSetupSteps } from "./sandbox-setup.js";

/**
 * `o11 ostack sandbox-setup` for an agent with the o11 CLI: each sandbox request as the `o11 sandbox` command line that
 * sends the same request, so a CLI agent never has to translate the connector's JSON. Placeholders stay as they are.
 */
const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

export function sandboxCliLine(request: SandboxSetupRequest): string {
  const { command, env, ...params } = request.params;
  const words = ["o11", "sandbox", request.action];
  if (request.id) words.push(request.id);
  if (typeof command === "string") words.push(shellQuote(command));
  if (request.provider) words.push("--provider", request.provider);
  // get-or-create would also prepare the sandbox and sign o11 in; the steps after it do both, once.
  if (request.action === "get-or-create") words.push("--no-prepare", "--login", "none");
  for (const [key, value] of Object.entries(params)) {
    words.push(value === true ? `--${kebab(key)}` : `--${kebab(key)} ${shellQuote(String(value))}`);
  }
  for (const [key, value] of Object.entries(env && typeof env === "object" ? env : {})) words.push("--env", shellQuote(`${key}=${String(value)}`));
  return words.join(" ");
}

type Setup = ReturnType<typeof sandboxSetupSteps>;
const withCli = <T extends { request: SandboxSetupRequest }>(item: T) => ({ ...item, cli: sandboxCliLine(item.request) });

export function sandboxSetupForCli(setup: Setup) {
  return {
    ...setup,
    steps: setup.steps.map(withCli),
    when_a_site_needs_the_person: setup.when_a_site_needs_the_person.map(withCli),
    when_the_person_returns: setup.when_the_person_returns.map(withCli),
    next: "Run each step's cli line in order, filling in the {placeholders}. A value the person or a page gives goes inside the single quotes with each ' written as '\\''. A failed step can run again, but use_login only as its then says. If exec answers status running, run o11 sandbox command-status {sandbox} --command-id <commandId> until it has an exitCode, then o11 sandbox logs {sandbox} --command-id <commandId> for the output. Where a then names kit_read or kit_write, use the matching o11 ostack command (o11 ostack setup status, settings, schedule). Tell the person only what a step's then says to ask them.",
  };
}
