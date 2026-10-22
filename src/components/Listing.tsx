"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { setListing, setShopPublished } from "@/lib/actions";

/** แถบสถานะร้าน + เช็กลิสต์ก่อนเปิดให้เช่า (หน้าจัดการร้าน) */
export function PublishBar({ shopId, published, active, unit, total, priced, listed, unlistedIds, hasPlan }: {
  shopId: string; published: boolean; active: boolean; unit: string;
  total: number; priced: number; listed: number; unlistedIds: string[]; hasPlan: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [period, setPeriod] = useState<"MONTH" | "DAY">("MONTH");

  const toggle = () => start(async () => { const r = await setShopPublished(shopId, !published); setMsg(r?.error ?? null); });
  const listAll = () => {
    const p = Number(price);
    if (!price && !priced) return setMsg("กรอกราคาก่อน");
    if (price && !(p > 0)) return setMsg("ราคาต้องมากกว่า 0");
    start(async () => {
      const r = await setListing(shopId, unlistedIds, { ...(price && { price: p, period }), listed: true });
      setMsg(r.skipped.length ? `เปิดแล้ว ${r.updated} รายการ · ยังไม่มีราคา: ${r.skipped.join(", ")}` : null);
      setPrice("");
    });
  };

  const steps: [boolean, string][] = [
    [hasPlan || total > 0, "สร้างผัง/เพิ่มพื้นที่"],
    [total > 0, `มี${unit}อย่างน้อย 1 รายการ`],
    [listed > 0, `ตั้งราคาและเปิดให้เช่า (${listed}/${total})`],
    [published, "เปิดร้านให้ผู้เช่าเห็น"],
  ];
  const status = !active ? ["ถูกระงับโดยแอดมิน", "bg-danger/10 text-danger"] : published ? ["● เปิดให้เช่าอยู่", "bg-ok/10 text-ok"] : ["ฉบับร่าง — ผู้เช่ายังไม่เห็น", "bg-panel2 text-ink2"];

  return (
    <section className={`card space-y-4 ${published && active ? "" : "border-brand"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${status[1]}`}>{status[0]}</span>
          <Link href={`/shops/${shopId}`} className="text-sm underline decoration-brand decoration-2 underline-offset-4">ดูหน้าร้าน (มุมมองผู้เช่า) ↗</Link>
        </div>
        {active && (
          <button className={published ? "btn-ghost" : "btn"} disabled={pending} onClick={toggle}>
            {published ? "ปิดร้านชั่วคราว" : "🚀 เปิดร้านให้เช่า"}
          </button>
        )}
      </div>

      <ol className="grid gap-2 sm:grid-cols-4 text-sm">
        {steps.map(([ok, label], i) => (
          <li key={label} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${ok ? "border-ok/30 bg-ok/5" : "border-line"}`}>
            <span className={`grid place-items-center size-6 rounded-full text-xs font-semibold shrink-0 ${ok ? "bg-ok text-white" : "bg-line text-ink2"}`}>{ok ? "✓" : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {unlistedIds.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-panel2 p-3">
          <div className="text-sm mr-auto">
            <div className="font-medium">มี {unlistedIds.length} {unit}ที่ยังไม่เปิดให้เช่า</div>
            <div className="text-xs text-muted">ตั้งราคาเดียวกันแล้วเปิดทั้งหมด (เว้นว่าง = ใช้ราคาเดิมของแต่ละรายการ) · ตั้งราคาทีละรายการได้ในผัง</div>
          </div>
          <label><span className="label">ราคา (บาท)</span><input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} className="input !w-32" placeholder="เช่น 1500" /></label>
          <label><span className="label">ต่อ</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value as "MONTH" | "DAY")} className="input !w-28"><option value="MONTH">เดือน</option><option value="DAY">วัน</option></select>
          </label>
          <button className="btn" disabled={pending} onClick={listAll}>เปิดให้เช่าทั้งหมด</button>
        </div>
      )}
      {msg && <p className="text-sm text-danger">{msg}</p>}
    </section>
  );
}

/** ตั้งราคา/เปิด-ปิดการเช่าหลายรายการที่เลือกในผัง */
export function BulkListing({ shopId, ids, unit }: { shopId: string; ids: string[]; unit: string }) {
  const [pending, start] = useTransition();
  const [price, setPrice] = useState("");
  const [period, setPeriod] = useState<"MONTH" | "DAY">("MONTH");
  const [msg, setMsg] = useState<string | null>(null);
  const run = (listed?: boolean) => {
    const p = Number(price);
    if (price && !(p >= 0)) return setMsg("ราคาไม่ถูกต้อง");
    start(async () => {
      const r = await setListing(shopId, ids, { ...(price && { price: p, period }), ...(listed !== undefined && { listed }) });
      setMsg(r.skipped.length ? `ยังไม่มีราคา จึงเปิดไม่ได้: ${r.skipped.join(", ")}` : "บันทึกแล้ว ✓");
    });
  };
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <div className="font-medium">ราคาและการเปิดให้เช่า ({ids.length} {unit})</div>
      <div className="flex gap-2">
        <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ราคา (บาท)" className="input" />
        <select value={period} onChange={(e) => setPeriod(e.target.value as "MONTH" | "DAY")} className="input !w-24"><option value="MONTH">/เดือน</option><option value="DAY">/วัน</option></select>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn !py-1.5" disabled={pending} onClick={() => run(true)}>{price ? "ตั้งราคา + เปิดให้เช่า" : "เปิดให้เช่า"}</button>
        <button className="btn-ghost !py-1.5" disabled={pending} onClick={() => run(false)}>ปิดการเช่า</button>
        {price && <button className="btn-ghost !py-1.5" disabled={pending} onClick={() => run()}>ตั้งราคาอย่างเดียว</button>}
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
