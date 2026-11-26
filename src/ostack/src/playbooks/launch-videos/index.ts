import type { PlaybookCode } from "../types.js";
import { downloadCommand } from "./download.js";
import { checkCommand, newCommand } from "./starters.js";
import { TRENDING_HELP, trendingCommand } from "./trending.js";
import { createCommand, templateCommand, templatesCommand, updateCommand, uploadCommand, videoCommand, videosCommand } from "./videos.js";

const HELP = `  new <name> --format irl|reel|product-demo|ugc [--dir <path>]
                                               start a video folder from the renderer kit (default: videos/<name> here)
  check                                        whether this computer can render: ffmpeg, Google Chrome, and Node or Bun
  templates [--format irl|reel|product-demo] [--search <text>]
                                               library films whose title or publisher matches
  template <slug or film link>                 one film template's recipe, such as product-demo/raycast-1a2b3c4d
  videos                                       the workspace's videos in o11, newest first
  video <id or link> [--wait <seconds>]        one video: its brief, its template's recipe, every version and its page;
                                               --wait (up to 600) first waits for a template to be picked on that page
  create --title <text> --format irl|reel|product-demo [--template <slug or film link>]
                                               start a video in o11 and print its page; without --template, send the
                                               user the page to pick one
  update <id> [--title <text>] [--template <slug>|blank] [--goal|--audience|--storyboard|--material|--notes <text>]
         [--length <seconds>] [--aspect 16:9|9:16|4:5|1:1] [--part <name>=<text>]
                                               rename it, switch its template, or fill in its brief (fields merge; an
                                               empty value clears one; --part sets a part this kind of video adds)
  upload <video-id> <cut> [<same cut in another shape>...] [--preview <file>] [--poster <file>] [--note <text>]
                                               upload a finished cut as the next version, the first cut playing on its
                                               page; ffmpeg makes the preview loop and poster when they are not given
  download <video or film link> [--version <n>] [--aspect 16:9|9:16|4:5|1:1|all] [--dir <path>]
                                               save a library film, or a cut of one of your videos (newest version and
                                               main cut unless --version or --aspect say otherwise), to study or reuse
${TRENDING_HELP}

Every command takes a video's o11 link in place of its id, and a film's link in place of its slug.

Each video is a folder on this computer: edit/ says what the video is, media/ holds the clips, narration and brand
files, output/ everything generated. The ugc format adds recoverable generation jobs and reusable reference assets.
Remote UGC videos use reel; local UGC folders use ugc. With user authorization, finished cuts upload as video
versions and selected generation references upload to their
chosen service. Media stays out of shared playbook files. The team's rules (brand, voice, music, formats) are files
under launch-videos/, such as launch-videos/script.md.`;

export const launchVideos: PlaybookCode = {
  help: HELP,
  commands: {
    new: newCommand, check: checkCommand,
    templates: templatesCommand, template: templateCommand,
    videos: videosCommand, video: videoCommand, projects: videosCommand, project: videoCommand, create: createCommand, update: updateCommand, upload: uploadCommand,
    trending: trendingCommand,
    download: downloadCommand,
  },
};
