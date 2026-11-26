import type { RemoteFile } from "./remote.js";
import type { TeamView } from "./team-view.js";

/**
 * One file of a kit's merged tree: every file the team, this person (in the wallet) and this computer (custom.local/)
 * added under `<kit>/`, at any depth and of any type. Binary files carry their type and size and are never
 * instruction text; open one by its path when a task needs it. Lowest priority first: team, me, local.
 */
export type TreeEntry = { path: string; layer: "team" | "me" | "local"; content_type?: string; size_bytes?: number; binary?: true; disk_path?: string };

const fromWallet = (files: RemoteFile[], kit: string, layer: "team" | "me"): TreeEntry[] => files
  .filter((file) => file.path.startsWith(`${kit}/`))
  .map((file) => (file.object
    ? { path: file.path, layer, content_type: file.object.contentType, size_bytes: file.object.sizeBytes, binary: true as const }
    : { path: file.path, layer }));

export async function kitTree(view: TeamView, kit: string): Promise<TreeEntry[]> {
  const local = view.localTree ? await view.localTree(kit) : [];
  return [
    ...fromWallet(view.setup.files.team, kit, "team"),
    ...fromWallet(view.setup.files.mine, kit, "me"),
    ...local.map((file): TreeEntry => ({ path: file.path, layer: "local", disk_path: file.diskPath, ...(file.binary ? { size_bytes: file.sizeBytes, binary: true as const } : {}) })),
  ];
}
