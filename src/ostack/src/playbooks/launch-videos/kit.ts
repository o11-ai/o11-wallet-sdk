import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { KITS } from "../../../content/kits.js";
import { oneOf, optional, required, type Args } from "../../lib/args.js";
import { OstackError } from "../../lib/errors.js";
import { print } from "../../lib/output.js";
import { checkName, loadLocalWorkspace, requirePlaybook } from "../../lib/workspace.js";

const PLAYBOOK = "launch-videos";
const KIT = `playbooks/${PLAYBOOK}/kit/`;
export const FORMATS = ["irl", "reel", "product-demo"] as const;
type Format = (typeof FORMATS)[number];

/** The kit's shared files, then the format's own files in their place. */
export function kitFiles(format: Format): Map<string, string> {
  const files = new Map<string, string>();
  const own = `formats/${format}/`;
  for (const [path, text] of Object.entries(KITS)) {
    if (!path.startsWith(KIT)) continue;
    const local = path.slice(KIT.length);
    if (!local.startsWith("formats/")) files.set(local, text);
  }
  for (const [path, text] of Object.entries(KITS)) {
    const local = path.startsWith(KIT) ? path.slice(KIT.length) : "";
    if (local.startsWith(own)) files.set(local.slice(own.length), text);
  }
  files.set("package.json", `${JSON.stringify({
    name: "launch-video", private: true, type: "module",
    scripts: {
      media: "node scripts/prepare.mjs --scale 0.5", pauses: "node scripts/pauses.mjs", capture: "node scripts/capture.mjs", speech: "node scripts/speech.mjs",
      sfx: "node scripts/sound-effects.mjs", mix: "node scripts/mix.mjs",
      preview: "node scripts/render.mjs --scale 0.5 && node scripts/encode.mjs --scale 0.5",
      audit: "node scripts/audit/stillness.mjs && node scripts/audit/overlap.mjs && node scripts/audit/sound.mjs",
    },
    dependencies: { "playwright-core": "1.49.1" },
  }, null, 2)}\n`);
  files.set(".gitignore", "node_modules/\nmedia/\noutput/\n");
  return files;
}

/** `o11 ostack launch-videos new <name> --format irl|product-demo [--dir <path>]` */
export async function newCommand(args: Args): Promise<void> {
  const workspace = await loadLocalWorkspace();
  requirePlaybook(workspace, PLAYBOOK);
  const name = checkName(args.positionals[1] ?? required(args, "name"), "video");
  const format = oneOf(args, "format", FORMATS);
  const dir = resolve(optional(args, "dir") ?? join(workspace.root, "videos", name));
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new OstackError("video_exists", `${dir} already has files. Nothing was changed; pick another name or --dir.`, { dir });
  }
  const files = kitFiles(format);
  for (const [path, text] of files) {
    const target = join(dir, ...path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  for (const folder of ["media/clips", "media/brand", "media/words", ...(format === "product-demo" ? ["media/narration"] : [])]) {
    mkdirSync(join(dir, folder), { recursive: true });
  }
  print({
    video: dir,
    format,
    files: files.size,
    next: [
      `cd ${dir} && bun install (or npm install), then run "o11 ostack launch-videos check"`,
      format === "product-demo" ? "Put the brand mark and font in media/brand/, and point edit/capture.js at the product."
        : `Put the filmed ${format === "reel" ? "selfie clip" : "clips"} in media/clips/ and the brand mark and font in media/brand/.`,
      `Follow the ostack-launch-videos skill: "o11 ostack context ${PLAYBOOK}/brief" is the first step.`,
    ],
  });
}

type Check = { check: string; status: "ok" | "fail"; detail: string };

function version(command: string, flag = "--version"): string | null {
  const run = spawnSync(command, [flag], { encoding: "utf8" });
  return run.status === 0 ? (run.stdout || run.stderr).split("\n")[0]!.trim() : null;
}

function chrome(): string | null {
  const candidates = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome",
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  ];
  return candidates.find((path): path is string => Boolean(path && existsSync(path))) ?? null;
}

/** `o11 ostack launch-videos check`: what rendering needs on this computer. */
export async function checkCommand(): Promise<void> {
  const ffmpeg = version(process.env.FFMPEG ?? "ffmpeg", "-version");
  const browser = chrome();
  const runtime = version("node") ?? version("bun");
  const checks: Check[] = [
    { check: "ffmpeg", status: ffmpeg ? "ok" : "fail", detail: ffmpeg ?? "Not found, or it does not run on this computer (an Intel build on Apple silicon fails). Install ffmpeg (brew install ffmpeg on a Mac), or set FFMPEG to a working one." },
    { check: "chrome", status: browser ? "ok" : "fail", detail: browser ?? "Google Chrome not found. Install it, or set CHROME to a Chrome or Chromium executable." },
    { check: "node or bun", status: runtime ? "ok" : "fail", detail: runtime ?? "Neither node nor bun is on PATH. Install Node 20 or newer." },
  ];
  print({ ok: checks.every((item) => item.status === "ok"), checks });
  if (checks.some((item) => item.status === "fail")) process.exitCode = 1;
}
