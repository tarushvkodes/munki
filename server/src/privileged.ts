import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { definePrivilegedContracts, definePrivilegedHandlers, z } from "@hatch/space-sdk";

export const privileged = definePrivilegedContracts({
  scanLessonFiles: {
    request: z.object({}),
    response: z.object({ documents: z.array(z.string()) }),
    capabilities: ["filesystem.read"],
    timeoutMs: 10_000,
  },
});

export const privilegedHandlers = definePrivilegedHandlers(privileged, {
  async scanLessonFiles() {
    const root = "/home/hatch/workspace/munki-lessons";
    const documents: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && entry.name.endsWith(".json")) documents.push(await readFile(path, "utf8"));
      }
    };
    await walk(root);
    return { documents };
  },
});
