"use client";
import { useRef, useState, useTransition } from "react";
import { uploadPaymentSlip } from "@/lib/actions";

const src = (file: string) => `/api/photos/${file}`;

/** ย่อรูปสลิปที่ใหญ่เกิน (รูปจากมือถือ) ก่อนส่ง — สลิปยังอ่านตัวเลขได้ชัดที่ 1600px */
async function shrink(file: File): Promise<Blob> {
  if (file.size < 1.5 * 1024 * 1024 || file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.9));
}

/** ลิงก์ "ดูสลิป" + หน้าต่างดูรูปใหญ่ */
export function SlipLink({ slip, label = "🧾 ดูสลิป" }: { slip: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="font-medium text-sky-700 underline cursor-pointer">{label}</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src(slip)} alt="สลิปโอนเงิน" className="max-h-[85vh] max-w-full rounded-xl bg-white" />
          <a href={src(slip)} target="_blank" rel="noopener noreferrer" className="absolute top-4 right-4 btn-ghost" onClick={(e) => e.stopPropagation()}>เปิดรูปเต็ม ↗</a>
        </div>
      )}
    </>
  );
}

/** แนบ/เปลี่ยนสลิปของงวดที่ยังไม่ยืนยันรับเงิน (owner = เจ้าของร้านแนบสลิปที่ผู้เช่าส่งมา) */
export function SlipUpload({ paymentId, slip, owner = false }: { paymentId: string; slip: string | null; owner?: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pick = (file?: File) => {
    if (!file) return;
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.append("file", await shrink(file), file.name);
      const r = await uploadPaymentSlip(paymentId, fd);
      if (r?.error) setErr(r.error);
      if (input.current) input.current.value = "";
    });
  };
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {slip && <><span className="text-sky-700">{owner ? "มีสลิปแล้ว" : "ส่งสลิปแล้ว · รอยืนยัน"}</span><SlipLink slip={slip} label="ดู" /></>}
      <button type="button" disabled={pending} onClick={() => input.current?.click()} className="rounded-md border border-line bg-panel px-2 py-0.5 text-xs hover:bg-panel2 cursor-pointer disabled:opacity-50">
        {pending ? "กำลังส่ง…" : slip ? "เปลี่ยนสลิป" : "📎 แนบสลิป"}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {err && <span className="w-full text-right text-[11px] text-danger">{err}</span>}
    </span>
  );
}
