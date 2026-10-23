import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { db, assetPhotos } from "@/db";

/** ไฟล์รูปเก็บนอก public/ แล้วเสิร์ฟผ่าน /api/photos/[id] (ถ้าเขียนดิสก์ไม่ได้บน Serverless จะมี In-Memory Fallback ให้ด้วย) */
const defaultUploadDir = process.env.VERCEL ? path.join(os.tmpdir(), "kepz-uploads") : "uploads";
const DIR = path.resolve(process.env.UPLOAD_DIR ?? defaultUploadDir);
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_PER_ASSET = 10;

const g = globalThis as unknown as { _memPhotos?: Map<string, Uint8Array> };
const memPhotos = (g._memPhotos ??= new Map<string, Uint8Array>());

/** ตรวจชนิดไฟล์จาก magic bytes ไม่เชื่อ MIME ที่เบราว์เซอร์ส่งมา */
export function sniffImage(b: Uint8Array): { mime: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (String.fromCharCode(...b.slice(0, 4)) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export async function savePhotoFile(name: string, data: Uint8Array) {
  const safe = path.basename(name);
  memPhotos.set(safe, data);
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(path.join(DIR, safe), data);
  } catch {
    // บน Serverless หากเขียนไฟล์ลงดิสก์ไม่ได้ จะดึงจาก memPhotos แทน
  }
}

export async function readPhotoFile(name: string) {
  const safe = path.basename(name);
  const mem = memPhotos.get(safe);
  if (mem) return mem;
  return readFile(path.join(DIR, safe));
}

/** ลบไฟล์รูปของห้องเหล่านี้ (เรียกก่อนลบห้อง เพราะ cascade ลบแค่แถวในฐานข้อมูล) */
export async function removePhotoFilesOf(assetIds: string[]) {
  if (!assetIds.length) return;
  const rows = await db.query.assetPhotos.findMany({ where: inArray(assetPhotos.assetId, assetIds) });
  await Promise.all(
    rows.map((r) => {
      memPhotos.delete(path.basename(r.file));
      return unlink(path.join(DIR, r.file)).catch(() => {});
    }),
  );
}

export async function removePhotoFile(name: string) {
  const safe = path.basename(name);
  memPhotos.delete(safe);
  await unlink(path.join(DIR, safe)).catch(() => {});
}
