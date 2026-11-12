import { audienceFile } from "../../lib/layers.js";
import { parseFrontmatter } from "../../lib/paths.js";
import type { Workspace } from "../../lib/workspace.js";
import { fromRemote, withAudience, type AudienceSource } from "./settings.js";

/**
 * GTM's settings for one audience: the team's, this person's, then the audience's audience.md and follow-up.md
 * front matter. Follow-ups use the audience of each person's CRM record, so one follow-ups run handles every audience.
 */
export function audienceSettings(workspace: Workspace, audience: string) {
  const base = fromRemote(workspace.settings.playbooks.gtm ?? {});
  const source = (name: string): AudienceSource | undefined => {
    const file = audienceFile(workspace, "gtm", audience, name).at(-1);
    return file ? { path: file.path, data: parseFrontmatter(file.content).data } : undefined;
  };
  return withAudience(base, { audience: source("audience.md"), followUp: source("follow-up.md") });
}
