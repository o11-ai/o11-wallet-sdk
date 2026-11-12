import { gtm } from "./gtm/index.js";
import { launchVideos } from "./launch-videos/index.js";
import type { PlaybookCode } from "./types.js";

/** Playbooks that ship code. Every playbook also needs a playbooks/<id>/playbook.md. */
export const PLAYBOOK_CODE: Record<string, PlaybookCode> = { gtm, "launch-videos": launchVideos };
