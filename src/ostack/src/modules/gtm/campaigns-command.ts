import { print } from "../../lib/output.js";
import { loadWorkspace } from "../../lib/workspace.js";

/** Campaigns whose notes the team saved under campaigns/<name>/. The default campaign needs none. */
export async function campaignsCommand(): Promise<void> {
  const workspace = await loadWorkspace();
  const names = workspace.setup.notes.team.flatMap((note) => {
    const match = note.path.match(/^campaigns\/([a-z0-9-]+)\//);
    return match ? [match[1]!] : [];
  });
  print({ default: "main", with_notes: [...new Set(names)].sort() });
}
