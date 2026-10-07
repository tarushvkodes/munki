import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runFile = promisify(execFile);

const clientDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = "/home/hatch/workspace/manim/videos";
const assetRoot = join(clientDir, "src/assets/videos");
const manifest = JSON.parse(await readFile(join(clientDir, "video-manifest.json"), "utf8"));
const metadata = manifest.videos ?? {};

const videos = [];
for (const [relativePath, details] of Object.entries(metadata)) {
  if (!/^(?:lesson\d+|exam2-review|phys172-exam2)\/[^/]+\.mp4$/.test(relativePath)) {
    throw new Error(`Invalid lesson video path in manifest: ${relativePath}`);
  }
  if (details?.sealed === true) continue;
  const folderMatch = /^lesson(\d+)\//.exec(relativePath);
  const pathLesson = Number(folderMatch?.[1]);
  const lesson = Number(details?.lesson ?? pathLesson);
  if (!Number.isInteger(lesson) || lesson < 1) throw new Error(`Missing lesson sort number for ${relativePath}`);
  if (details?.className !== "MA 162" && details?.className !== "PHYS 172") throw new Error(`Missing supported class name for ${relativePath}`);
  if (typeof details?.scopeLabel !== "string" || !details.scopeLabel.trim()) throw new Error(`Missing scope label for ${relativePath}`);
  if (details?.format !== "Short" && details?.format !== "Explainer") throw new Error(`Missing Short/Explainer format for ${relativePath}`);
  if (typeof details?.topic !== "string" || !details.topic.trim()) throw new Error(`Missing topic for ${relativePath}`);
  if (typeof details?.targetAssessment !== "string" || !details.targetAssessment.trim()) throw new Error(`Missing target assessment for ${relativePath}`);
  if (typeof details?.assessmentDate !== "string" || !details.assessmentDate.trim() || !Number.isFinite(new Date(details.assessmentDate).getTime())) {
    throw new Error(`Missing or invalid assessment date for ${relativePath}`);
  }

  const source = join(sourceRoot, relativePath);
  const destination = join(assetRoot, relativePath);
  try {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  } catch {
    // The owned copy may already exist when the external render workspace is unavailable.
  }
  try {
    await readFile(destination);
  } catch {
    console.warn(`Skipping ${relativePath}: no owned video file is available.`);
    continue;
  }

  // Safari webviews need the MP4 index before the media payload when the host
  // serves an artifact asset without reliable byte-range seeking. Preserve the
  // H.264/AAC streams and move only the moov atom to the front of the file.
  const streamingCopy = `${destination}.streaming.mp4`;
  try {
    await runFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", destination, "-c", "copy", "-movflags", "+faststart", streamingCopy]);
    await rename(streamingCopy, destination);
  } catch (error) {
    await rm(streamingCopy, { force: true });
    throw new Error(`Could not prepare ${relativePath} for in-app streaming.`, { cause: error });
  }

  videos.push({
    id: relativePath.replace(/\.mp4$/, "").replaceAll("/", "-"),
    lesson,
    className: details.className,
    scopeLabel: details.scopeLabel,
    topic: details.topic,
    title: details.title ?? `${details.scopeLabel} ${details.format.toLowerCase()}`,
    format: details.format,
    durationSeconds: details.durationSeconds ?? 0,
    xp: details.xp ?? (details.format === "Short" ? 35 : 55),
    targetAssessment: details.targetAssessment,
    assessmentDate: details.assessmentDate,
    sealed: false,
    relativePath,
  });
}

videos.sort((a, b) => a.lesson - b.lesson || (a.format === "Short" ? -1 : 1));
const imports = videos.map((video, index) => `import video${index} from "./assets/videos/${video.relativePath}";`).join("\n");
const rows = videos.map((video, index) => {
  const serializable = {
    id: video.id,
    lesson: video.lesson,
    className: video.className,
    scopeLabel: video.scopeLabel,
    topic: video.topic,
    title: video.title,
    format: video.format,
    durationSeconds: video.durationSeconds,
    xp: video.xp,
    targetAssessment: video.targetAssessment,
    assessmentDate: video.assessmentDate,
    sealed: video.sealed,
  };
  return `  ${JSON.stringify(serializable).replace(/}$/, `, "source": video${index} }`)},`;
}).join("\n");
const source = `${imports}\n\nexport type LessonVideo = {\n  id: string;\n  lesson: number;\n  className: \"MA 162\" | \"PHYS 172\";\n  scopeLabel: string;\n  topic: string;\n  title: string;\n  format: "Short" | "Explainer";\n  durationSeconds: number;\n  xp: number;\n  targetAssessment: string;\n  assessmentDate: string;\n  sealed: boolean;\n  source: string;\n};\n\n// Bun emits imported media as a document-relative \"./assets/...\" string. The\n// Muse shell can mount the document at a rewritten route, so resolving that\n// string from the document can point outside this artifact. Resolve the emitted\n// filename from this module's own URL instead; the module and videos are sibling\n// files in the shipped assets directory.\nfunction bundledVideoUrl(asset: string) {\n  const filename = asset.split(\"/\").pop();\n  if (!filename) return asset;\n  return new URL(filename, import.meta.url).href;\n}\n\n// Generated from client/video-manifest.json. Sealed entries are omitted.\nconst lessonVideoManifest: LessonVideo[] = [\n${rows}\n];\n\nexport const lessonVideos: LessonVideo[] = lessonVideoManifest.map((video) => ({\n  ...video,\n  source: bundledVideoUrl(video.source),\n}));\n`;
await writeFile(join(clientDir, "src/video-registry.ts"), source);
