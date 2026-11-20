/**
 * Every playbook command (`o11 ostack <playbook> <command>`, from PLAYBOOK_CODE) and its route. They keep local files,
 * render video or call the wallet's video API from the CLI, so all run on the person's o11 sandbox. Subcommands a
 * command dispatches on (gtm tam check, launch-videos trending rank, ...) are listed one by one; settings keys go
 * through core `settings set`, and removed commands are left out.
 */
import type { CommandEntry } from "./command-registry.js";

const sandbox = (cli: string, summary: string): CommandEntry => ({ cli, summary, route: { via: "sandbox" } });

const GTM: readonly CommandEntry[] = [
  sandbox("gtm audiences", "Each audience: its files, templates, follow-ups and settings."),
  sandbox("gtm campaigns", "Same as audiences."),
  sandbox("gtm tam check", "Label each CSV row's homepage, writing a new CSV."),
  sandbox("gtm ledger export", "Write the pre-0.6 local ledger to CSV files."),
];

const LAUNCH_VIDEOS: readonly CommandEntry[] = [
  sandbox("launch-videos new", "Start a video folder from the renderer kit."),
  sandbox("launch-videos check", "Whether this computer can render: ffmpeg, Chrome, Node or Bun."),
  sandbox("launch-videos templates", "Library films whose title or publisher matches."),
  sandbox("launch-videos template", "One film template's recipe."),
  sandbox("launch-videos videos", "The workspace's videos in o11, newest first."),
  sandbox("launch-videos video", "One video: its brief, template recipe, versions and page."),
  sandbox("launch-videos projects", "Same as videos."),
  sandbox("launch-videos project", "Same as video."),
  sandbox("launch-videos create", "Start a video in o11 and print its page."),
  sandbox("launch-videos update", "Rename a video, switch its template or fill in its brief."),
  sandbox("launch-videos upload", "Upload a finished cut as the video's next version."),
  sandbox("launch-videos trending rank", "Rank saved search results by views per day."),
  sandbox("launch-videos trending import", "Save ranked rows or one link as references."),
  sandbox("launch-videos trending list", "Imported references, their metrics and teardowns."),
  sandbox("launch-videos trending comments", "Save the most-liked comments, ready to tag."),
  sandbox("launch-videos trending creator", "One creator's followers, median views and outlier posts."),
  sandbox("launch-videos trending measure", "Append a dated reading of one published post."),
  sandbox("launch-videos trending compare", "Versions A and B side by side after posting."),
  sandbox("launch-videos download", "Save a library film or a cut of one of your videos."),
];

export const PLAYBOOK_COMMAND_ROUTES: readonly CommandEntry[] = [...GTM, ...LAUNCH_VIDEOS];
