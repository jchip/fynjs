import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { TemplateTags } from "./tag-template.js";
import {
  decodeTemplateSnapshot,
  encodeTemplateSnapshot,
  type TemplateSnapshot,
} from "./template-snapshot.js";

export interface LoadedTemplateSnapshot {
  templateTags: TemplateTags;
  templateDir: string;
}

export async function exportTemplateSnapshot(
  templateModule: string | URL,
  snapshotFile: string | URL,
): Promise<TemplateSnapshot> {
  const moduleUrl = toFileUrl(templateModule, "template module");
  const loaded = (await import(moduleUrl.href)) as Record<string, unknown>;
  if (!("default" in loaded)) {
    throw new TypeError("template snapshot: template module has no default export");
  }

  const snapshot = encodeTemplateSnapshot(loaded.default as TemplateTags);
  const snapshotUrl = toFileUrl(snapshotFile, "snapshot file");
  await writeFile(snapshotUrl, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

export async function loadTemplateSnapshot(
  snapshotFile: string | URL,
): Promise<LoadedTemplateSnapshot> {
  const snapshotUrl = toFileUrl(snapshotFile, "snapshot file");
  const snapshot = JSON.parse(await readFile(snapshotUrl, "utf8")) as unknown;
  return {
    templateTags: decodeTemplateSnapshot(snapshot),
    templateDir: dirname(fileURLToPath(snapshotUrl)),
  };
}

function toFileUrl(value: string | URL, label: string): URL {
  if (typeof value === "string") return pathToFileURL(resolve(value));
  if (value.protocol !== "file:") {
    throw new TypeError(`template snapshot: ${label} must be a file URL`);
  }
  return value;
}
