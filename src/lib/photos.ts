import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { db, assetPhotos } from "@/db";

/** ไฟล์รูปเก็บนอก public/ แล้วเสิร์ฟผ่าน /api/photos/[id] (โฟลเดอร์ public ไม่รับไฟล์ใหม่หลัง build) */
const DIR = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_PER_ASSET = 10;

/** ตรวจชนิดไฟล์จาก magic bytes ไม่เชื่อ MIME ที่เบราว์เซอร์ส่งมา */
export function sniffImage(b: Uint8Array): { mime: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (String.fromCharCode(...b.slice(0, 4)) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export async function savePhotoFile(name: string, data: Uint8Array) {
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, name), data);
}

export async function readPhotoFile(name: string) {
  return readFile(path.join(DIR, path.basename(name)));
}

/** ลบไฟล์รูปของห้องเหล่านี้ (เรียกก่อนลบห้อง เพราะ cascade ลบแค่แถวในฐานข้อมูล) */
export async function removePhotoFilesOf(assetIds: string[]) {
  if (!assetIds.length) return;
  const rows = await db.query.assetPhotos.findMany({ where: inArray(assetPhotos.assetId, assetIds) });
  await Promise.all(rows.map((r) => unlink(path.join(DIR, r.file)).catch(() => {})));
}

export async function removePhotoFile(name: string) {
  await unlink(path.join(DIR, path.basename(name))).catch(() => {});
}
