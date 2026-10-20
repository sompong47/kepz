"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteAssetPhoto, uploadAssetPhoto } from "@/lib/actions";

const MAX_SIDE = 1600;
const url = (id: string) => `/api/photos/${id}`;

/** ย่อรูปใหญ่ฝั่งเบราว์เซอร์ก่อนอัปโหลด (รูปจากมือถือมักใหญ่หลาย MB) */
async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.85));
}

export default function Photos({ shopId, assetId, photos, editable }: { shopId: string; assetId: string; photos: string[]; editable: boolean }) {
  const [view, setView] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (view === null) return;
    // ฟังแบบ capture แล้วหยุด event ไม่ให้คีย์ลัดของผัง (ลูกศร/Esc/Delete) ทำงานซ้อน
    const onKey = (e: KeyboardEvent) => {
      if (["Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"].includes(e.key)) e.stopPropagation();
      if (e.key === "Escape") setView(null);
      if (e.key === "ArrowRight") setView((v) => (v === null ? v : (v + 1) % photos.length));
      if (e.key === "ArrowLeft") setView((v) => (v === null ? v : (v - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [view, photos.length]);

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    start(async () => {
      const errors: string[] = [];
      for (let i = 0; i < list.length; i++) {
        setStatus(`กำลังอัปโหลด ${i + 1}/${list.length}…`);
        const fd = new FormData();
        fd.append("file", await shrink(list[i]), list[i].name);
        const r = await uploadAssetPhoto(shopId, assetId, fd);
        if (r?.error) errors.push(`${list[i].name}: ${r.error}`);
      }
      setStatus(errors.length ? errors.join("\n") : null);
      if (input.current) input.current.value = "";
    });
  };

  if (!photos.length && !editable) return null;
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <div className="text-slate-400">รูปภาพ {photos.length > 0 && `(${photos.length})`}</div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((id, i) => (
          <div key={id} className="relative group aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url(id)} alt="" loading="lazy" onClick={() => setView(i)} className="size-full object-cover rounded-lg cursor-zoom-in bg-panel2" />
            {editable && (
              <button
                type="button"
                title="ลบรูป"
                disabled={pending}
                onClick={() => { if (confirm("ลบรูปนี้?")) start(async () => { await deleteAssetPhoto(shopId, id); }); }}
                className="absolute top-1 right-1 size-6 rounded-full bg-black/70 text-white text-xs opacity-0 group-hover:opacity-100 focus:opacity-100"
              >✕</button>
            )}
          </div>
        ))}
        {editable && (
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className="aspect-square rounded-lg border-2 border-dashed border-line text-slate-400 text-xs hover:border-brand hover:text-brand disabled:opacity-50"
          >＋<br />เพิ่มรูป</button>
        )}
      </div>
      {editable && <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => upload(e.target.files)} />}
      {status && <p className={`text-xs whitespace-pre-line ${pending ? "text-slate-400" : "text-red-400"}`}>{status}</p>}

      {view !== null && photos[view] && (
        <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4" onClick={() => setView(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url(photos[view])} alt="" className="max-h-[85vh] max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
          {photos.length > 1 && (
            <div className="absolute bottom-6 flex items-center gap-4 text-white" onClick={(e) => e.stopPropagation()}>
              <button className="btn-ghost" onClick={() => setView((view - 1 + photos.length) % photos.length)}>‹</button>
              <span className="text-sm">{view + 1} / {photos.length}</span>
              <button className="btn-ghost" onClick={() => setView((view + 1) % photos.length)}>›</button>
            </div>
          )}
          <button className="absolute top-4 right-4 btn-ghost text-white" onClick={() => setView(null)}>✕ ปิด</button>
        </div>
      )}
    </div>
  );
}
