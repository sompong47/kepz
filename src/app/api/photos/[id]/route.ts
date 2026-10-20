import { eq } from "drizzle-orm";
import { db, assetPhotos } from "@/db";
import { readPhotoFile } from "@/lib/photos";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
