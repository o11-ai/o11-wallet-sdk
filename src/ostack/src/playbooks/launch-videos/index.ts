import type { PlaybookCode } from "../types.js";
import { checkCommand, newCommand } from "./kit.js";
import { createCommand, templateCommand, templatesCommand, updateCommand, uploadCommand, videoCommand, videosCommand } from "./videos.js";

const HELP = `  new <name> --format irl|reel|product-demo [--dir <path>]
                                               start a video folder from the renderer kit (default: videos/<name> here)
  check                                        whether this computer can render: ffmpeg, Google Chrome, and Node or Bun
  templates [--format <format>] [--search <text>]
                                               library films whose title or publisher matches
  template <slug>                              one film template's recipe, such as product-demo/raycast-1a2b3c4d
  videos                                       the workspace's videos in o11, newest first
  video <id> [--wait <seconds>]                one video: its brief, its template's recipe, every version and its page;
                                               --wait (up to 600) first waits for a template to be picked on that page
  create --title <text> --format <format> [--template <slug>]
                                               start a video in o11 and print its page; without --template, send the
                                               user the page to pick one
  update <id> [--title <text>] [--template <slug>|blank] [--goal|--audience|--storyboard|--material|--notes <text>]
         [--length <seconds>] [--aspect 16:9|9:16|4:5|1:1] [--part <name>=<text>]
                                               rename it, switch its template, or fill in its brief (fields merge; an
                                               empty value clears one; --part sets a part this kind of video adds)
  upload <video-id> <cut> [<same cut in another shape>...] [--preview <file>] [--poster <file>] [--note <text>]
                                               upload a finished cut as the next version, the first cut playing on its
                                               page; ffmpeg makes the preview loop and poster when they are not given

Each video is a folder on this computer: edit/ says what the video is, media/ holds the clips, narration and brand
files, output/ everything generated. Only finished cuts you upload go to o11, as versions of a video. The team's
rules for every video (brand, voice, music, formats) are files under launch-videos/, such as launch-videos/script.md.`;

export const launchVideos: PlaybookCode = {
  help: HELP,
  commands: {
    new: newCommand, check: checkCommand,
    templates: templatesCommand, template: templateCommand,
    videos: videosCommand, video: videoCommand, create: createCommand, update: updateCommand, upload: uploadCommand,
  },
};
