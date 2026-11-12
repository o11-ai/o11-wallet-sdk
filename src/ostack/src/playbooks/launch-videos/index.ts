import type { PlaybookCode } from "../types.js";
import { checkCommand, newCommand } from "./kit.js";

const HELP = `  new <name> --format irl|reel|product-demo [--dir <path>]
                                               start a video folder from the renderer kit (default: videos/<name> here)
  check                                        whether this computer can render: ffmpeg, Google Chrome, and Node or Bun

Each video is a folder on this computer: edit/ says what the video is, media/ holds the clips, narration and brand
files, output/ everything generated. Nothing in media/ or output/ goes to o11. The team's rules for every video
(brand, voice, music, formats) are files under launch-videos/, such as launch-videos/script.md.`;

export const launchVideos: PlaybookCode = {
  help: HELP,
  commands: { new: newCommand, check: checkCommand },
};
