import { classifyAsset } from "@lg/core";
import type { Asset, AssetKind, ModuleKind } from "@lg/core";

/** Mirrors the server's upload limit (apps/server/src/routes/assets.ts). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface UploadItem {
  id: number;
  name: string;
  /** 0..1 */
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  asset?: Asset;
}

export type SendFile = (file: File, onProgress: (fraction: number) => void) => Promise<Asset>;

const extOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "");

export function fileKind(file: File): AssetKind | null {
  return classifyAsset(file.type, extOf(file.name));
}

/** The kinds a gallery can show: only rasters have the 320px thumbnail it renders. */
export const GALLERY_KINDS: AssetKind[] = ["image", "gif"];

/** The kinds a picker locked to `only` accepts ("image" includes animated gifs). */
export function allowedFor(only?: AssetKind | ""): AssetKind[] | undefined {
  if (!only) return undefined;
  return only === "image" ? GALLERY_KINDS : [only];
}

/** A user-facing reason the file can't be uploaded, or null when it can. */
export function validateUpload(file: File, allowed?: AssetKind[]): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  const kind = fileKind(file);
  if (!kind) return `${file.name} is not a supported file type.`;
  if (allowed && !allowed.includes(kind)) return `${file.name} is the wrong type here.`;
  return null;
}

/**
 * Upload files one after another, reporting every state change through
 * `onChange`. A failed file is recorded and does not stop the rest. Resolves with
 * the assets that made it.
 */
export async function runUploads(
  files: File[],
  opts: { send: SendFile; onChange: (items: UploadItem[]) => void; allowed?: AssetKind[]; firstId?: number },
): Promise<Asset[]> {
  const base = opts.firstId ?? 0;
  const items: UploadItem[] = files.map((f, i) => {
    const error = validateUpload(f, opts.allowed);
    return { id: base + i, name: f.name, progress: 0, status: error ? "error" : "queued", ...(error ? { error } : {}) };
  });
  const emit = () => opts.onChange(items.map((it) => ({ ...it })));
  emit();
  const done: Asset[] = [];
  for (const [i, file] of files.entries()) {
    const item = items[i]!;
    if (item.status === "error") continue;
    item.status = "uploading";
    emit();
    try {
      const asset = await opts.send(file, (fraction) => {
        item.progress = Math.min(1, Math.max(0, fraction));
        emit();
      });
      item.status = "done";
      item.progress = 1;
      item.asset = asset;
      done.push(asset);
    } catch (e) {
      item.status = "error";
      item.error = (e as Error).message || "Upload failed.";
    }
    emit();
  }
  return done;
}

/** True when a drag carries files from outside the page (as opposed to an in-page reorder). */
export function hasFiles(dt: DataTransfer | null | undefined): boolean {
  return !!dt && Array.from(dt.types ?? []).includes("Files");
}

export type DropTarget = { accepts: true } | { accepts: false; message: string };

/** What dropping or pasting an image on a module of this kind does. */
export function resolveDropTarget(kind: ModuleKind | undefined): DropTarget {
  if (kind === "gallery") return { accepts: true };
  return { accepts: false, message: "This module can't take images. Drop onto a Gallery module." };
}
