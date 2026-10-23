"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { savePaymentInfo, setListing, setShopPublished } from "@/lib/actions";
import { BANKS, hasPayInfo, type PayInfo } from "@/lib/domain";

/** แถบสถานะร้าน + เช็กลิสต์ก่อนเปิดให้เช่า (หน้าจัดการร้าน) */
export function PublishBar({ shopId, published, active, unit, total, priced, listed, unlistedIds, hasPlan, payment }: {
  shopId: string; published: boolean; active: boolean; unit: string;
  total: number; priced: number; listed: number; unlistedIds: string[]; hasPlan: boolean; payment: PayInfo;
}) {
  const payOk = hasPayInfo(payment);
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
    [payOk, "ตั้งช่องทางรับเงิน"],
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

      <ol className="grid gap-2 sm:grid-cols-5 text-sm">
        {steps.map(([ok, label], i) => (
          <li key={label} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${ok ? "border-ok/30 bg-ok/5" : "border-line"}`}>
            <span className={`grid place-items-center size-6 rounded-full text-xs font-semibold shrink-0 ${ok ? "bg-ok text-white" : "bg-line text-ink2"}`}>{ok ? "✓" : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <details className="group rounded-xl border border-line" open={!payOk}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm select-none">
          <span className="font-medium">💳 ช่องทางรับเงินจากผู้เช่า {payOk ? <span className="text-ok font-normal">· ตั้งแล้ว</span> : <span className="text-danger font-normal">· ยังไม่ได้ตั้ง (ต้องตั้งก่อนเปิดร้าน)</span>}</span>
          <span className="text-xs text-brand-ink group-open:hidden">แก้ไข ▾</span><span className="text-xs text-muted hidden group-open:inline">ซ่อน ▴</span>
        </summary>
        <div className="border-t border-line p-4"><PaymentSetup shopId={shopId} payment={payment} /></div>
      </details>

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

/** ฟอร์มตั้งช่องทางรับเงิน: บัญชีธนาคาร / พร้อมเพย์ / อัปโหลดรูป QR (อย่างน้อย 1 ทาง) */
export function PaymentSetup({ shopId, payment }: { shopId: string; payment: PayInfo }) {
  const [st, act, pending] = useActionState(savePaymentInfo.bind(null, shopId), undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (st && !st.error) { setSaved(true); setPreview(null); } }, [st]);
  const qrSrc = preview ?? (payment.payQr ? `/api/photos/${payment.payQr}` : null);
  return (
    <form action={act} className="grid gap-4 md:grid-cols-[1fr_200px]" onChange={() => setSaved(false)}>
      <div className="space-y-3">
        <p className="text-xs text-muted">ผู้เช่าจะเห็นข้อมูลนี้ในหน้า “การเช่าของฉัน” เมื่อคำขอเช่าได้รับอนุมัติ · ใส่อย่างน้อย 1 ทาง</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label><span className="label">🏦 ธนาคาร</span>
            <input name="payBank" list="kepz-banks" defaultValue={payment.payBank ?? ""} placeholder="เช่น กสิกรไทย" className="input" />
            <datalist id="kepz-banks">{BANKS.map((b) => <option key={b} value={b} />)}</datalist>
          </label>
          <label><span className="label">เลขบัญชี</span><input name="payAccountNo" inputMode="numeric" defaultValue={payment.payAccountNo ?? ""} placeholder="xxx-x-xxxxx-x" className="input" /></label>
          <label><span className="label">ชื่อบัญชี</span><input name="payAccountName" defaultValue={payment.payAccountName ?? ""} placeholder="ชื่อ-นามสกุล / ชื่อบริษัท" className="input" /></label>
        </div>
        <label className="block"><span className="label">📱 พร้อมเพย์ (เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก)</span>
          <input name="payPromptpay" inputMode="numeric" defaultValue={payment.payPromptpay ?? ""} placeholder="08xxxxxxxx" className="input" />
        </label>
        <label className="block"><span className="label">หมายเหตุถึงผู้เช่า (ไม่บังคับ)</span>
          <input name="payNote" defaultValue={payment.payNote ?? ""} placeholder="เช่น โอนแล้วส่งสลิปทาง LINE @kepz ภายในวันที่ 5 ของเดือน" className="input" />
        </label>
        {st?.error && <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{st.error}</p>}
        <div className="flex items-center gap-3">
          <button className="btn" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกช่องทางรับเงิน"}</button>
          {saved && <span className="text-sm text-ok">✓ บันทึกแล้ว</span>}
        </div>
      </div>
      <div className="space-y-2">
        <span className="label">🔳 รูป QR รับเงิน (จากแอปธนาคาร)</span>
        <label className="grid place-items-center aspect-square rounded-xl border-2 border-dashed border-line bg-panel2 cursor-pointer overflow-hidden hover:border-brand">
          {qrSrc
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={qrSrc} alt="QR รับเงิน" className="size-full object-contain bg-white" />
            : <span className="text-xs text-muted text-center px-3">＋ อัปโหลดรูป QR<br />PNG / JPG</span>}
          <input type="file" name="payQrFile" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} />
        </label>
        {payment.payQr && !preview && <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" name="removeQr" /> ลบรูป QR</label>}
      </div>
    </form>
  );
}

function PayRow({ label, value, copyValue, copied, onCopy }: { label: string; value: string; copyValue?: string; copied: string | null; onCopy: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted text-xs">{label}</span>
      <span className="flex items-center gap-2 font-medium">
        {value}
        {copyValue && <button type="button" onClick={() => onCopy(copyValue)} className="text-[11px] rounded-md border border-line px-1.5 py-0.5 hover:bg-panel2 cursor-pointer">{copied === copyValue ? "✓ คัดลอกแล้ว" : "คัดลอก"}</button>}
      </span>
    </div>
  );
}

/** การ์ดวิธีชำระเงิน (ฝั่งผู้เช่า): คัดลอกเลขบัญชี/พร้อมเพย์ และกดดู QR ขนาดใหญ่ */
export function PayInfoCard({ payment, amount }: { payment: PayInfo; amount?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  if (!hasPayInfo(payment)) return <p className="text-xs text-muted">ร้านยังไม่ได้ระบุช่องทางชำระเงิน — ติดต่อผู้ให้เช่าโดยตรง</p>;
  const onCopy = (v: string) => { navigator.clipboard?.writeText(v).then(() => { setCopied(v); setTimeout(() => setCopied(null), 1500); }); };
  const row = { copied, onCopy };
  return (
    <div className="rounded-xl border border-line bg-panel p-3 text-sm flex gap-3">
      <div className="flex-1 space-y-1.5">
        {amount && <PayRow label="ยอดที่ต้องชำระ" value={amount} {...row} />}
        {payment.payBank && payment.payAccountNo && <PayRow label={`🏦 ${payment.payBank}`} value={payment.payAccountNo} copyValue={payment.payAccountNo.replace(/\D/g, "")} {...row} />}
        {payment.payAccountName && <PayRow label="ชื่อบัญชี" value={payment.payAccountName} {...row} />}
        {payment.payPromptpay && <PayRow label="📱 พร้อมเพย์" value={payment.payPromptpay} copyValue={payment.payPromptpay} {...row} />}
        {payment.payNote && <p className="text-xs text-ink2 bg-panel2 rounded-lg px-2 py-1.5">{payment.payNote}</p>}
      </div>
      {payment.payQr && (
        <>
          <button type="button" onClick={() => setZoom(true)} className="shrink-0 cursor-zoom-in" title="แตะเพื่อขยาย QR">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${payment.payQr}`} alt="QR ชำระเงิน" className="size-24 rounded-lg border border-line bg-white object-contain" />
          </button>
          {zoom && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={() => setZoom(false)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${payment.payQr}`} alt="QR ชำระเงิน" className="max-h-[80vh] max-w-full rounded-2xl bg-white p-4" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
