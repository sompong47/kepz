import { eq } from "drizzle-orm";
import { db, assetPhotos } from "@/db";
import { readPhotoFile } from "@/lib/photos";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // รองรับการเรียกไฟล์รูปปกร้านโดยตรง เช่น /api/photos/uuid.jpg
  if (/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(id)) {
    const ext = id.split(".").pop()!.toLowerCase();
    try {
      const data = await readPhotoFile(id);
      return new Response(new Uint8Array(data), {
        headers: {
          "Content-Type": MIME[ext] ?? "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  const row = await db.query.assetPhotos.findFirst({ where: eq(assetPhotos.id, id) });
  if (!row) return new Response("Not found", { status: 404 });
  try {
    const data = await readPhotoFile(row.file);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
