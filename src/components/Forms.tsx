"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  login, register, demoQuickLogin, createShop, updateShop, deleteShop, uploadShopCover, deleteShopCover,
  addAsset, requestLease, createWalkInLease, type FormState,
} from "@/lib/actions";
import { CATEGORIES, BILLING, FLOOR_TEMPLATES, baht, buildPayments, daysBetween, fmtDate, type Category } from "@/lib/domain";
import { PayInfoCard } from "./Listing";
import { useShopPayInfo } from "./PayContext";

function Err({ s }: { s: FormState }) {
  return s?.error ? <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{s.error}</p> : null;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

/** ย่อรูปใหญ่ฝั่งเบราว์เซอร์ก่อนส่งขึ้นเซิร์ฟเวอร์ */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.85));
}

export function LoginForm() {
  const [st, act, pending] = useActionState(login, undefined);
  const [demoPending, startDemo] = useTransition();

  const DEMO_ACCOUNTS = [
    { label: "🏪 ทดสอบฝั่งเจ้าของร้าน (สร้างผัง / อนุมัติสัญญา / Walk-in)", email: "seller@kepz.test", sub: "คุณสมชาย · seller@kepz.test", to: "/seller" },
    { label: "👤 ทดสอบฝั่งผู้เช่า (เลือกห้องในผัง / ส่งคำขอเช่า / ดูบิล)", email: "tenant@kepz.test", sub: "คุณมานี · tenant@kepz.test", to: "/tenant" },
    { label: "🛡️ ทดสอบฝั่งแอดมิน (ดูภาพรวมระบบ / ระงับร้าน)", email: "admin@kepz.test", sub: "แอดมิน · admin@kepz.test", to: "/admin" },
  ];

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="card space-y-2.5 border-brand bg-brand/10">
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">⚡ เข้าสู่ระบบด่วนสำหรับทดสอบ (Demo)</span>
          <span className="text-[11px] rounded-full bg-brand px-2 py-0.5 font-semibold">คลิกเดียวเข้าได้เลย</span>
        </div>
        <p className="text-xs text-ink2">เลือกบทบาทที่ต้องการทดสอบโดยไม่ต้องพิมพ์รหัสผ่าน (รหัสผ่านทุกบัญชีคือ <code className="font-mono">password123</code>)</p>
        <div className="grid gap-2 pt-1">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              disabled={demoPending || pending}
              onClick={() => startDemo(async () => { await demoQuickLogin(acc.email, acc.to); })}
              className="text-left rounded-xl border border-line bg-panel hover:border-brand hover:bg-white px-3.5 py-2.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <div className="font-semibold text-xs sm:text-sm text-ink">{acc.label}</div>
              <div className="text-[11px] text-muted mt-0.5">{acc.sub}</div>
            </button>
          ))}
        </div>
      </div>

      <form action={act} className="card space-y-4">
        <h1 className="text-xl font-bold">เข้าสู่ระบบด้วยอีเมล</h1>
        <F label="อีเมล"><input name="email" type="email" required className="input" placeholder="seller@kepz.test" /></F>
        <F label="รหัสผ่าน"><input name="password" type="password" required className="input" placeholder="password123" /></F>
        <Err s={st} />
        <button className="btn w-full" disabled={pending || demoPending}>{pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
        <p className="text-sm text-muted text-center">ยังไม่มีบัญชี? <Link href="/register" className="text-brand-ink">สมัครสมาชิก</Link></p>
      </form>
    </div>
  );
}

export function RegisterForm() {
  const [st, act, pending] = useActionState(register, undefined);
  return (
    <form action={act} className="card space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold">สมัครสมาชิก</h1>
      <F label="ชื่อ"><input name="name" required className="input" /></F>
      <F label="อีเมล"><input name="email" type="email" required className="input" /></F>
      <F label="เบอร์โทร"><input name="phone" className="input" /></F>
      <F label="รหัสผ่าน (6 ตัวขึ้นไป)"><input name="password" type="password" required minLength={6} className="input" /></F>
      <Err s={st} />
      <button className="btn w-full" disabled={pending}>{pending ? "กำลังสมัคร…" : "สมัครสมาชิก"}</button>
    </form>
  );
}

export function ShopForm() {
  const [st, act, pending] = useActionState(createShop, undefined);
  const [cat, setCat] = useState<Category>("STORAGE");
  const defaultTpl = FLOOR_TEMPLATES.find((t) => t.category === cat)?.id ?? "";
  const [tplId, setTplId] = useState<string>(defaultTpl);
  const [preview, setPreview] = useState<string | null>(null);

  const pickCat = (c: Category) => {
    setCat(c);
    setTplId(FLOOR_TEMPLATES.find((t) => t.category === c)?.id ?? "");
  };

  const tpls = FLOOR_TEMPLATES.filter((t) => t.category === cat);

  return (
    <form action={act} className="card space-y-5 max-w-2xl">
      <div>
        <span className="label text-sm font-medium !text-ink mb-2">1. เลือกประเภทธุรกิจของคุณ</span>
        <input type="hidden" name="category" value={cat} />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(Object.entries(CATEGORIES) as [Category, typeof CATEGORIES[Category]][]).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => pickCat(k)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition cursor-pointer ${
                cat === k ? "border-brand bg-brand/15 font-semibold ring-2 ring-brand" : "border-line bg-panel hover:bg-panel2"
              }`}
            >
              <span className="text-2xl">{v.icon}</span>
              <span className="text-xs leading-tight">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label text-sm font-medium !text-ink mb-2">2. เลือกแม่แบบผังเริ่มต้น (ปรับแต่งเพิ่มเองได้เหมือน Canva)</span>
        <input type="hidden" name="templateId" value={tplId} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {tpls.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTplId(t.id)}
              className={`text-left rounded-xl border p-3.5 transition cursor-pointer ${
                tplId === t.id ? "border-brand bg-brand/15 ring-2 ring-brand" : "border-line bg-panel hover:bg-panel2"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">✨ แม่แบบพร้อมใช้</span>
                <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-ink">{t.badge}</span>
              </div>
              <div className="font-medium text-sm mt-1">{t.name}</div>
              <p className="text-xs text-muted mt-1">{t.desc}</p>
              <div className="mt-2 text-[11px] font-medium text-brand-ink">
                สร้างให้ทันที {t.assets.length} {CATEGORIES[cat].unit} + โซน/ทางเดินครบชุด
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTplId("")}
            className={`text-left rounded-xl border p-3.5 transition cursor-pointer flex flex-col justify-between ${
              tplId === "" ? "border-brand bg-brand/15 ring-2 ring-brand" : "border-line bg-panel hover:bg-panel2"
            }`}
          >
            <div>
              <div className="font-semibold text-sm">📐 เริ่มจากผังว่างเปล่า</div>
              <p className="text-xs text-muted mt-1">ค่อยไปวางโซน ทางเดิน และ{CATEGORIES[cat].unit}ด้วยตัวเองในหน้าแก้ไขผัง</p>
            </div>
            <div className="mt-2 text-[11px] text-muted">เหมาะสำหรับผังที่มีรูปแบบเฉพาะตัว</div>
          </button>
        </div>
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <span className="label text-sm font-medium !text-ink">3. รูปสถานที่จริง & พิกัดร้าน</span>
        <F label="📷 รูปภาพสถานที่จริง / หน้าร้าน (แสดงบนหน้าแรกให้ผู้เช่าเห็นบรรยากาศจริง)">
          <input
            type="file"
            name="cover"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
            className="input !py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1 file:text-xs file:font-semibold file:text-ink cursor-pointer"
          />
        </F>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="ตัวอย่างรูปหน้าร้าน" className="h-40 w-full object-cover rounded-xl border border-line" />
        )}

        <F label="ชื่อร้าน / ชื่อสถานที่"><input name="name" required className="input" placeholder={`เช่น kepz ${CATEGORIES[cat].label}`} /></F>
        <div className="grid sm:grid-cols-2 gap-3">
          <F label="📍 ที่ตั้ง / โซนทำเล (กดหมุดแล้วไป Google Maps)"><input name="location" className="input" placeholder="เช่น รามอินทรา 77, ลาดพร้าว 41" /></F>
          <F label="📞 เบอร์ติดต่อ"><input name="phone" className="input" placeholder="08x-xxx-xxxx" /></F>
        </div>
        <F label="🗺️ ลิงก์ Google Maps (ไม่บังคับ — ถ้าเว้นว่าง ระบบจะค้นหาจากชื่อที่ตั้งให้อัตโนมัติ)">
          <input name="mapUrl" className="input" placeholder="เช่น https://maps.app.goo.gl/..." />
        </F>
        <F label="รายละเอียดเพิ่มเติม"><textarea name="description" rows={2} className="input" placeholder="จุดเด่น เวลาเปิด-ปิด หรือสิ่งอำนวยความสะดวก…" /></F>
      </div>

      <Err s={st} />
      <button className="btn w-full sm:w-auto px-6" disabled={pending}>
        {pending ? "กำลังสร้างร้านและจัดผัง…" : tplId ? "🚀 สร้างร้านพร้อมผังสำเร็จรูป" : "สร้างร้าน"}
      </button>
    </form>
  );
}

/** แถบรูปสถานที่จริงด้านบนหน้าจัดการร้าน ให้เจ้าของอัปโหลด/เปลี่ยนรูปหน้างานได้ในคลิกเดียว */
export function ShopCoverBar({ shopId, coverPhoto, shopName }: { shopId: string; coverPhoto: string | null; shopName: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.append("file", await shrinkImage(file), file.name);
      const r = await uploadShopCover(shopId, fd);
      if (r?.error) setErr(r.error);
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return (
    <div className="card !p-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {coverPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photos/${coverPhoto}`} alt={shopName} className="h-16 w-28 object-cover rounded-xl border border-line bg-panel2 shrink-0" />
        ) : (
          <div className="h-16 w-28 rounded-xl border-2 border-dashed border-line bg-panel2 grid place-items-center text-xs text-muted shrink-0">
            ยังไม่มีรูป
          </div>
        )}
        <div>
          <div className="font-semibold text-sm">📷 รูปภาพสถานที่จริงของร้าน (แสดงเป็นรูปปกในการ์ดหน้าแรก)</div>
          <div className="text-xs text-muted">
            {coverPhoto
              ? "ผู้เช่าจะเห็นรูปสถานที่จริงนี้บนหน้าแรก ช่วยให้ตัดสินใจเช่าง่ายขึ้น"
              : "อัปโหลดรูปถ่ายหน้างานจริง เพื่อให้ผู้เช่าเห็นบรรยากาศสถานที่ก่อนกดดูผัง"}
          </div>
          {err && <div className="text-xs text-danger mt-0.5">{err}</div>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(e) => onPick(e.target.files)}
        />
        <button type="button" disabled={pending} onClick={() => inputRef.current?.click()} className={coverPhoto ? "btn-ghost !py-1.5 text-xs" : "btn !py-1.5 text-xs"}>
          {pending ? "กำลังอัปโหลด…" : coverPhoto ? "📷 เปลี่ยนรูปสถานที่จริง" : "＋ อัปโหลดรูปสถานที่จริง"}
        </button>
        {coverPhoto && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await deleteShopCover(shopId); })}
            className="btn-ghost !py-1.5 text-xs !text-danger"
          >
            ลบรูป
          </button>
        )}
      </div>
    </div>
  );
}

export function AssetForm({ shopId, unit }: { shopId: string; unit: string }) {
  const [st, act, pending] = useActionState(addAsset.bind(null, shopId), undefined);
  return (
    <form action={act} className="card space-y-3">
      <h3 className="font-semibold">เพิ่ม{unit}</h3>
      <div className="grid grid-cols-2 gap-3">
        <F label="รหัส/ชื่อ"><input name="code" required placeholder="A01" className="input" /></F>
        <F label="ป้ายขนาด"><input name="size" placeholder="XS, S, M, L…" className="input" /></F>
        <F label="กว้าง (เมตร)"><input name="wm" type="number" min={1} step={0.5} placeholder="5" className="input" /></F>
        <F label="ยาว (เมตร)"><input name="hm" type="number" min={1} step={0.5} placeholder="3.5" className="input" /></F>
        <F label="ราคา (บาท)"><input name="price" type="number" min={1} required className="input" /></F>
        <F label="คิดราคาต่อ">
          <select name="period" className="input"><option value="MONTH">เดือน</option><option value="DAY">วัน</option></select>
        </F>
      </div>
      <F label="หมายเหตุ"><input name="note" className="input" /></F>
      <Err s={st} />
      <button className="btn" disabled={pending}>เพิ่ม</button>
    </form>
  );
}

export type BusyRange = { start: number; end: number };

/** ฟอร์มขอเช่า: คำนวณยอดให้ทันที และแสดงช่วงที่มีผู้เช่าแล้ว */
export function RentForm({ assetId, price, period, busy = [] }: { assetId: string; price: number; period: "DAY" | "MONTH"; busy?: BusyRange[] }) {
  const [st, act, pending] = useActionState(requestLease.bind(null, assetId), undefined);
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({ start: "", end: "", billing: "MONTH" as "MONTH" | "HALF_YEAR" | "YEAR" });
  const s = v.start ? new Date(v.start) : null, e = v.end ? new Date(v.end) : null;
  const valid = s && e && +e > +s;
  const clash = valid && busy.some((r) => r.start < +e! && r.end > +s!);
  const pays = valid ? buildPayments({ price, period, start: s!, end: e!, billing: v.billing }) : [];
  const total = pays.reduce((n, p) => n + p.amount, 0);
  const upcoming = busy.filter((r) => r.end >= Date.now()).sort((x, y) => x.start - y.start);
  const payment = useShopPayInfo();
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  return (
    <form action={act} className="space-y-2.5 mt-3 border-t border-line pt-3">
      {upcoming.length > 0 && (
        <div className="rounded-lg bg-panel2 px-3 py-2 text-xs">
          <div className="font-medium mb-0.5">ช่วงที่มีผู้เช่าแล้ว</div>
          {upcoming.map((r) => <div key={r.start} className="text-muted">{fmtDate(r.start)} – {fmtDate(r.end)}</div>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <F label="วันเริ่มเช่า"><input type="date" name="start" min={today} required className="input" value={v.start} onChange={(x) => setV({ ...v, start: x.target.value })} /></F>
        <F label="วันสิ้นสุด"><input type="date" name="end" min={v.start || today} required className="input" value={v.end} onChange={(x) => setV({ ...v, end: x.target.value })} /></F>
      </div>
      {period === "MONTH" && (
        <F label="รอบชำระเงิน">
          <select name="billing" className="input" value={v.billing} onChange={(x) => setV({ ...v, billing: x.target.value as typeof v.billing })}>
            {Object.entries(BILLING).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </F>
      )}
      {valid && (
        <div className={`rounded-xl px-3 py-2.5 text-sm ${clash ? "bg-danger/10 text-danger" : "bg-brand/15"}`}>
          {clash ? "ช่วงวันที่นี้ทับกับผู้เช่าคนอื่น" : (
            <>
              <div className="flex justify-between"><span>ยอดรวมทั้งหมด</span><b>{baht(total)}</b></div>
              <div className="flex justify-between text-xs text-ink2 mt-0.5">
                <span>{period === "DAY" ? `${daysBetween(s!, e!)} วัน × ${baht(price)}` : `${pays.length} งวด`}</span>
                <span>งวดแรก {baht(pays[0]?.amount ?? 0)} · {fmtDate(s!)}</span>
              </div>
            </>
          )}
        </div>
      )}
      {payment && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-ink2">💳 ช่องทางชำระเงินของร้าน</div>
          <PayInfoCard payment={payment} amount={valid && !clash && pays[0] ? `${baht(pays[0].amount)} (งวดแรก)` : undefined} />
          <p className="text-[11px] text-muted">ยังไม่ต้องโอนตอนนี้ — โอนหลังผู้ให้เช่าอนุมัติ ดูยอดแต่ละงวดได้ที่หน้า “การเช่าของฉัน”</p>
        </div>
      )}
      <label className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2 cursor-pointer hover:border-brand">
        {slipPreview
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={slipPreview} alt="สลิป" className="size-12 rounded-lg object-cover border border-line" />
          : <span className="grid place-items-center size-12 rounded-lg bg-panel2 text-xl">🧾</span>}
        <span className="text-xs">
          <span className="font-semibold block">{slipPreview ? "แนบสลิปแล้ว · แตะเพื่อเปลี่ยน" : "แนบสลิปงวดแรก (ไม่บังคับ)"}</span>
          <span className="text-muted">ถ้าโอนไว้แล้ว แนบสลิปมาพร้อมคำขอได้เลย · JPG/PNG ไม่เกิน 5MB</span>
        </span>
        <input type="file" name="slip" accept="image/png,image/jpeg,image/webp" hidden onChange={(x) => {
          const f = x.target.files?.[0];
          if (f && f.size > 5 * 1024 * 1024) { alert("รูปสลิปใหญ่เกิน 5MB — ลองแคปหน้าจอสลิปแทน"); x.target.value = ""; return setSlipPreview(null); }
          setSlipPreview(f ? URL.createObjectURL(f) : null);
        }} />
      </label>
      <Err s={st} />
      <button className="btn w-full" disabled={pending || !!clash}>{pending ? "กำลังส่ง…" : "✓ ยืนยันส่งคำขอเช่า"}</button>
      <p className="text-[11px] text-muted text-center">ผู้ให้เช่าจะตรวจสอบและอนุมัติ แล้วระบบจะสร้างตารางชำระเงินให้</p>
    </form>
  );
}

/** ฟอร์มบันทึกผู้เช่าหน้าร้าน (Walk-in) สำหรับเจ้าของร้าน (ใช้ได้ทั้งในผังและในแท็บผู้เช่า) */
export function WalkInForm({
  shopId,
  unit,
  assets,
  defaultAssetId,
  onDone,
}: {
  shopId: string;
  unit: string;
  assets: { id: string; code: string; size: string | null; price: number; period: "DAY" | "MONTH" }[];
  defaultAssetId?: string;
  onDone?: () => void;
}) {
  const [st, act, pending] = useActionState(createWalkInLease.bind(null, shopId), undefined);
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [assetId, setAssetId] = useState(defaultAssetId ?? assets[0]?.id ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(nextMonth);
  const [billing, setBilling] = useState<"MONTH" | "HALF_YEAR" | "YEAR">("MONTH");

  const cur = assets.find((a) => a.id === assetId);

  return (
    <form action={act} className="space-y-2.5 text-sm">
      {defaultAssetId ? (
        <input type="hidden" name="assetId" value={defaultAssetId} />
      ) : (
        <F label={`เลือก${unit}ที่จะลงผู้เช่า`}>
          <select name="assetId" value={assetId} onChange={(e) => setAssetId(e.target.value)} required className="input">
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.size ? `(${a.size})` : ""} — {baht(a.price)}/{a.period === "DAY" ? "วัน" : "เดือน"}
              </option>
            ))}
          </select>
        </F>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        <F label="ชื่อผู้เช่า (Walk-in)"><input name="guestName" required placeholder="เช่น คุณสมศรี" className="input" /></F>
        <F label="เบอร์โทรติดต่อ"><input name="guestPhone" placeholder="08x-xxx-xxxx" className="input" /></F>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <F label="วันเริ่มสัญญา"><input type="date" name="start" required value={start} onChange={(e) => setStart(e.target.value)} className="input" /></F>
        <F label="วันสิ้นสุด"><input type="date" name="end" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} className="input" /></F>
      </div>
      {cur?.period === "MONTH" && (
        <F label="รอบชำระเงิน">
          <select name="billing" value={billing} onChange={(e) => setBilling(e.target.value as typeof billing)} className="input">
            {Object.entries(BILLING).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </F>
      )}
      <label className="flex items-center gap-2 rounded-xl border border-line bg-panel2/60 px-3 py-2 cursor-pointer text-xs">
        <input type="checkbox" name="paidFirst" defaultChecked className="size-4 accent-[#16a34a]" />
        <span>รับชำระเงินงวดแรกแล้ว (บันทึกสถานะชำระเงินทันที)</span>
      </label>
      <Err s={st} />
      {st?.ids?.length && <p className="text-xs text-ok font-medium">✓ บันทึกผู้เช่าหน้าร้านเรียบร้อยแล้ว</p>}
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={pending || !assets.length}>
          {pending ? "กำลังบันทึก…" : "✓ บันทึกสัญญาเช่า Walk-in"}
        </button>
        {onDone && <button type="button" className="btn-ghost" onClick={onDone}>ปิด</button>}
      </div>
    </form>
  );
}

/** ฟอร์มแก้ไขข้อมูลร้านค้าและลบร้าน */
export function ShopSettingsForm({
  shop,
}: {
  shop: { id: string; name: string; category: Category; location: string | null; mapUrl?: string | null; coverPhoto?: string | null; phone: string | null; description: string | null };
}) {
  const [st, act, pending] = useActionState(updateShop.bind(null, shop.id), undefined);
  const [delSt, delAct, delPending] = useActionState(deleteShop.bind(null, shop.id), undefined);

  return (
    <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
      <form action={act} className="card space-y-4">
        <h3 className="font-bold text-lg">⚙️ แก้ไขข้อมูลร้านค้า & พิกัดแผนที่</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <F label="ชื่อร้าน / ชื่อสถานที่">
            <input name="name" defaultValue={shop.name} required className="input" />
          </F>
          <F label="ประเภทธุรกิจ">
            <select name="category" defaultValue={shop.category} className="input">
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </F>
          <F label="📍 ที่ตั้ง / โซนทำเล">
            <input name="location" defaultValue={shop.location ?? ""} placeholder="เช่น รามอินทรา 77, ลาดพร้าว 41" className="input" />
          </F>
          <F label="📞 เบอร์ติดต่อร้าน">
            <input name="phone" defaultValue={shop.phone ?? ""} placeholder="08x-xxx-xxxx" className="input" />
          </F>
        </div>
        <F label="🗺️ ลิงก์พิกัด Google Maps (ถ้าเว้นว่าง ระบบจะค้นหาจากชื่อที่ตั้งให้อัตโนมัติ)">
          <input name="mapUrl" defaultValue={shop.mapUrl ?? ""} placeholder="วางลิงก์ https://maps.app.goo.gl/... หรือพิกัดละติจูด,ลองจิจูด" className="input" />
        </F>
        <F label="📷 อัปโหลดรูปสถานที่จริงใหม่ (ไม่เลือก = ใช้รูปเดิม)">
          <input
            type="file"
            name="cover"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="input !py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1 file:text-xs file:font-semibold file:text-ink cursor-pointer"
          />
        </F>
        <F label="รายละเอียดร้าน / จุดเด่น / เวลาเปิด-ปิด">
          <textarea name="description" rows={3} defaultValue={shop.description ?? ""} className="input" />
        </F>
        <Err s={st} />
        {st?.ids?.includes("saved") && (
          <p className="text-sm text-ok bg-ok/10 rounded-xl px-3 py-2 font-medium">✓ บันทึกข้อมูลร้านเรียบร้อยแล้ว</p>
        )}
        <button className="btn" disabled={pending}>{pending ? "กำลังบันทึก…" : "💾 บันทึกการเปลี่ยนแปลง"}</button>
      </form>

      <div className="card space-y-3 self-start border-danger/30">
        <h3 className="font-bold text-base text-danger">🗑 ลบร้านค้านี้</h3>
        <p className="text-xs text-muted">
          การลบร้านจะลบผัง โซน และรายการพื้นที่เช่าทั้งหมดอย่างถาวร (ไม่สามารถลบได้หากยังมีสัญญาเช่าที่กำลังใช้งานอยู่)
        </p>
        <Err s={delSt} />
        <form
          action={delAct}
          onSubmit={(e) => {
            if (!confirm(`ยืนยันการลบร้าน "${shop.name}" อย่างถาวร?`)) e.preventDefault();
          }}
        >
          <button className="btn-ghost !border-danger/40 !text-danger w-full" disabled={delPending}>
            {delPending ? "กำลังลบร้าน…" : "ลบร้านค้าถาวร"}
          </button>
        </form>
      </div>
    </div>
  );
}
