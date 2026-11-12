import { allAudienceTemplates, listAudiences } from "../../lib/layers.js";
import { print } from "../../lib/output.js";
import { audienceFolder, checkName, DEFAULT_AUDIENCE, loadWorkspace } from "../../lib/workspace.js";
import { OstackError } from "../../lib/errors.js";
import type { Args } from "../../lib/args.js";
import { audienceSettings } from "./audience-settings.js";
import { showSettings } from "./settings.js";

/**
 * `o11 ostack gtm audiences [<name>]`: each audience with the folder its files live in, its templates (version ids
 * and weights for an A/B split), its follow-up timing and its settings after audience.md and follow-up.md.
 */
export async function audiencesCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const known = listAudiences(workspace, "gtm");
  const named = args.positionals[1] ? checkName(args.positionals[1], "audience") : undefined;
  if (named && !known.includes(named)) {
    throw new OstackError("unknown_audience", `No audience named "${named}". Create it by saving a file in ${audienceFolder("gtm", named)}/.`, { audiences: known });
  }
  const audiences = (named ? [named] : known).map((name) => {
    const { settings, from, warnings } = audienceSettings(workspace, name);
    const templates = allAudienceTemplates(workspace, "gtm", name).map(({ text: _text, ...template }) => template);
    const folder = name === DEFAULT_AUDIENCE ? "gtm" : audienceFolder("gtm", name);
    return {
      name,
      folder,
      files: workspace.setup.files.team.filter((file) => file.path.startsWith(`${folder}/`) && (name !== DEFAULT_AUDIENCE || !file.path.slice(4).includes("/"))).map((file) => file.path),
      templates,
      ab_test: templates.filter((template) => template.active).length > 1,
      follow_ups: settings.follow_up_days.length > 0 ? settings.follow_up_days : "off",
      settings: showSettings(settings),
      settings_from: from,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  });
  print(named ? audiences[0] : { default: DEFAULT_AUDIENCE, audiences });
}
