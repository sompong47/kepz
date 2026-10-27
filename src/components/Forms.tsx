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
  return (
    <form action={act} className="card space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold">เข้าสู่ระบบ</h1>
      <F label="อีเมล"><input name="email" type="email" required className="input" placeholder="you@example.com" /></F>
      <F label="รหัสผ่าน"><input name="password" type="password" required className="input" /></F>
      <Err s={st} />
      <button className="btn w-full" disabled={pending}>{pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
      <p className="text-sm text-muted text-center">ยังไม่มีบัญชี? <Link href="/register" className="text-brand-ink">สมัครสมาชิก</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const [st, act, pending] = useActionState(register, undefined);
  return (
    <form action={act} className="card space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold">สมัครใช้งานสำหรับเจ้าของพื้นที่เช่า</h1>
      <p className="text-sm text-muted -mt-2">ผู้เช่าไม่ต้องสมัคร — เจ้าของเป็นผู้บันทึกข้อมูลผู้เช่าและการชำระเงินเอง</p>
      <F label="ชื่อ"><input name="name" required className="input" /></F>
      <F label="อีเมล"><input name="email" type="email" required className="input" /></F>
      <F label="เบอร์โทร"><input name="phone" className="input" /></F>
      <F label="รหัสผ่าน (6 ตัวขึ้นไป)"><input name="password" type="password" required minLength={6} className="input" /></F>
      <Err s={st} />
      <button className="btn w-full" disabled={pending}>{pending ? "กำลังสมัคร…" : "สมัครสมาชิก"}</button>
    </form>
  );
}

export function ShopForm({ initialCategory }: { initialCategory?: Category } = {}) {
  const [st, act, pending] = useActionState(createShop, undefined);
  const [cat, setCat] = useState<Category>(initialCategory ?? "STORAGE");
  const defaultTpl = FLOOR_TEMPLATES.find((t) => t.category === cat)?.id ?? "";
  const [tplId, setTplId] = useState<string>(defaultTpl);
  const [preview, setPreview] = useState<string | null>(null);
  const [shopName, setShopName] = useState("");
  const [shopLoc, setShopLoc] = useState("");

  const pickCat = (c: Category) => {
    setCat(c);
    setTplId(FLOOR_TEMPLATES.find((t) => t.category === c)?.id ?? "");
  };

  const tpls = FLOOR_TEMPLATES.filter((t) => t.category === cat);
  const selectedTpl = FLOOR_TEMPLATES.find((t) => t.id === tplId);
  const pW = selectedTpl?.w ?? 1000;
  const pH = selectedTpl?.h ?? 600;

  return (
    <form action={act} className="grid gap-5 lg:grid-cols-[1.15fr_1fr] items-start">
      {/* คอลัมน์ซ้าย: ขั้นตอนการตั้งค่าแบบกระชับ รองรับมือถือ */}
      <div className="card space-y-4">
        <div>
          <span className="label !text-xs font-bold !text-ink mb-2">1. เลือกประเภทสถานที่ของคุณ</span>
          <input type="hidden" name="category" value={cat} />
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
            {(Object.entries(CATEGORIES) as [Category, typeof CATEGORIES[Category]][]).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => pickCat(k)}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 px-1.5 text-center transition cursor-pointer ${
                  cat === k ? "border-brand bg-brand/20 font-bold ring-2 ring-brand text-ink" : "border-line bg-panel hover:bg-panel2 text-ink2"
                }`}
              >
                <span className="text-xl sm:text-2xl leading-none">{v.icon}</span>
                <span className="text-[11px] leading-tight line-clamp-1">{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-line pt-3.5">
          <span className="label !text-xs font-bold !text-ink mb-2">2. เลือกรูปแบบผังเริ่มต้น (ปรับแต่งต่อเองได้เหมือน Canva)</span>
          <input type="hidden" name="templateId" value={tplId} />
          <div className="grid gap-2 sm:grid-cols-2">
            {tpls.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTplId(t.id)}
                className={`text-left rounded-xl border p-3 transition cursor-pointer ${
                  tplId === t.id ? "border-brand bg-brand/15 ring-2 ring-brand" : "border-line bg-panel hover:bg-panel2"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-bold text-xs">✨ แม่แบบพร้อมใช้</span>
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-ink">{t.badge}</span>
                </div>
                <div className="font-semibold text-xs sm:text-sm mt-1 line-clamp-1">{t.name}</div>
                <p className="text-[11px] text-muted mt-0.5 line-clamp-2">{t.desc}</p>
                <div className="mt-1.5 text-[11px] font-semibold text-brand-ink">
                  ✓ ได้ทันที {t.assets.length} {CATEGORIES[cat].unit} + {t.features.length} โซน/ทางเดิน
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTplId("")}
              className={`text-left rounded-xl border p-3 transition cursor-pointer flex flex-col justify-between ${
                tplId === "" ? "border-brand bg-brand/15 ring-2 ring-brand" : "border-line bg-panel hover:bg-panel2"
              }`}
            >
              <div>
                <div className="font-bold text-xs sm:text-sm">📐 ผังว่างเปล่า (กำหนดเอง)</div>
                <p className="text-[11px] text-muted mt-0.5">เริ่มจากกระดาษเปล่า แล้วลากวางโซน ทางเดิน และ{CATEGORIES[cat].unit}ด้วยตัวเอง</p>
              </div>
              <div className="mt-1.5 text-[11px] text-muted">เหมาะสำหรับผังเฉพาะตัว</div>
            </button>
          </div>
        </div>

        <div className="space-y-2.5 border-t border-line pt-3.5">
          <span className="label !text-xs font-bold !text-ink">3. ข้อมูลสถานที่</span>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <F label="ชื่อร้าน / ชื่อสถานที่ *">
              <input
                name="name"
                required
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="input"
                placeholder={`เช่น kepz ${CATEGORIES[cat].label}`}
              />
            </F>
            <F label="📞 เบอร์ติดต่อ">
              <input name="phone" className="input" placeholder="08x-xxx-xxxx" />
            </F>
          </div>

          <div className="grid sm:grid-cols-2 gap-2.5">
            <F label="📍 ที่ตั้ง / โซนทำเล">
              <input
                name="location"
                value={shopLoc}
                onChange={(e) => setShopLoc(e.target.value)}
                className="input"
                placeholder="เช่น รามอินทรา 77, ลาดพร้าว 41"
              />
            </F>
            <F label="🗺️ ลิงก์ Google Maps (ไม่บังคับ)">
              <input name="mapUrl" className="input" placeholder="https://maps.app.goo.gl/..." />
            </F>
          </div>

          <div className="grid sm:grid-cols-2 gap-2.5 items-start">
            <F label="📷 รูปสถานที่จริง / หน้าร้าน (ไม่บังคับ)">
              <input
                type="file"
                name="cover"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPreview(f ? URL.createObjectURL(f) : null);
                }}
                className="input !py-1.5 file:mr-2 file:rounded-lg file:border-0 file:bg-brand file:px-2.5 file:py-1 file:text-[11px] file:font-semibold file:text-ink cursor-pointer"
              />
            </F>
            <F label="รายละเอียดสั้นๆ">
              <input name="description" className="input" placeholder="จุดเด่น เวลาเปิด-ปิด หรือสิ่งอำนวยความสะดวก…" />
            </F>
          </div>

          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="ตัวอย่างรูปหน้าร้าน" className="h-28 w-full object-cover rounded-xl border border-line" />
          )}
        </div>

        <Err s={st} />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button className="btn flex-1 sm:flex-none !py-2.5 !px-6" disabled={pending}>
            {pending ? "กำลังสร้างผัง…" : tplId ? "🚀 สร้างและเปิดสตูดิโอแต่งผัง" : "🚀 สร้างผังใหม่"}
          </button>
          <Link href="/seller" className="btn-ghost !py-2.5">ยกเลิก</Link>
        </div>
      </div>

      {/* คอลัมน์ขวา: พรีวิวผังสดแบบ Interactive (เห็นทันทีว่าเลือกแม่แบบนี้แล้วจะได้ผังหน้าตาอย่างไร) */}
      <div className="card space-y-3 lg:sticky lg:top-20 bg-gradient-to-b from-white to-[#faf8f2]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-8 rounded-xl bg-brand/25 text-lg">{CATEGORIES[cat].icon}</span>
            <div>
              <div className="font-bold text-xs sm:text-sm leading-tight">
                {shopName.trim() || `ตัวอย่างผัง${CATEGORIES[cat].label}`}
              </div>
              <div className="text-[11px] text-muted">
                {shopLoc.trim() ? `📍 ${shopLoc}` : selectedTpl ? selectedTpl.name : "ผังว่างเปล่า 50×30 ม."}
              </div>
            </div>
          </div>
          <span className="rounded-full bg-ink text-white px-2.5 py-0.5 text-[10px] font-semibold shrink-0">
            Live Preview
          </span>
        </div>

        {/* กรอบแสดงผัง SVG จำลอง */}
        <div className="rounded-xl border border-line bg-[#faf8f2] overflow-hidden aspect-[16/10] shadow-inner grid place-items-center p-2">
          {selectedTpl ? (
            <svg viewBox={`0 0 ${pW} ${pH}`} preserveAspectRatio="xMidYMid meet" className="size-full">
              <rect x={0} y={0} width={pW} height={pH} rx={16} fill="#ffffff" stroke="#e5e0d0" strokeWidth={4} />
              {selectedTpl.features.map((f, i) => {
                const isRoad = f.kind === "ROAD";
                const isWater = f.kind === "WATER";
                const isGreen = f.kind === "GREEN";
                const fill = f.color
                  ? `${f.color}22`
                  : isRoad
                    ? "#dcdad2"
                    : isWater
                      ? "#bae6fd"
                      : isGreen
                        ? "#bbf7d0"
                        : "#fef9c3";
                return (
                  <g key={i}>
                    <rect
                      x={f.x}
                      y={f.y}
                      width={f.w}
                      height={f.h}
                      rx={8}
                      fill={fill}
                      stroke={f.color || "#cbd5e1"}
                      strokeWidth={2}
                      strokeDasharray={f.kind === "ZONE" ? "8 5" : undefined}
                    />
                    {f.label && (
                      <text
                        x={f.x + (f.kind === "ZONE" ? 12 : f.w / 2)}
                        y={f.y + (f.kind === "ZONE" ? 20 : f.h / 2 + 4)}
                        textAnchor={f.kind === "ZONE" ? "start" : "middle"}
                        fontSize={13}
                        fontWeight="bold"
                        fill="#334155"
                      >
                        {f.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {selectedTpl.assets.map((a, idx) => (
                <g key={idx}>
                  <rect
                    x={a.x}
                    y={a.y}
                    width={a.w}
                    height={a.h}
                    rx={a.shape === "CIRCLE" ? Math.min(a.w, a.h) / 2 : 8}
                    fill="#ffffff"
                    stroke="#16a34a"
                    strokeWidth={3}
                  />
                  <text
                    x={a.x + a.w / 2}
                    y={a.y + a.h / 2 - 2}
                    textAnchor="middle"
                    fontSize={Math.min(15, a.w / 4.5)}
                    fontWeight="bold"
                    fill="#111"
                  >
                    {a.prefix}{String(idx + 1).padStart(2, "0")}
                  </text>
                  {a.h >= 55 && (
                    <text
                      x={a.x + a.w / 2}
                      y={a.y + a.h / 2 + 13}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#15803d"
                      fontWeight="bold"
                    >
                      ฿{a.price.toLocaleString()}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          ) : (
            <div className="text-center space-y-1.5 p-4">
              <div className="text-2xl">📐</div>
              <div className="font-bold text-xs text-ink">กระดานผังว่างเปล่า (50 × 30 เมตร)</div>
              <p className="text-[11px] text-muted max-w-xs">
                คุณสามารถลากวาง{CATEGORIES[cat].unit} ถนน โซน และอัปโหลดรูปแปลนพื้นหลังเองได้อิสระในหน้าถัดไป
              </p>
            </div>
          )}
        </div>

        {/* สรุปสิ่งที่ได้จากแม่แบบ */}
        {selectedTpl && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-panel2 px-2 py-2">
              <div className="font-extrabold text-sm sm:text-base text-ink">{selectedTpl.assets.length}</div>
              <div className="text-[10px] text-muted">{CATEGORIES[cat].unit}พร้อมเช่า</div>
            </div>
            <div className="rounded-xl bg-panel2 px-2 py-2">
              <div className="font-extrabold text-sm sm:text-base text-ink">{selectedTpl.features.length}</div>
              <div className="text-[10px] text-muted">โซน/ทางเดิน</div>
            </div>
            <div className="rounded-xl bg-panel2 px-2 py-2">
              <div className="font-extrabold text-sm sm:text-base text-ok">
                ฿{Math.min(...selectedTpl.assets.map((a) => a.price)).toLocaleString()}+
              </div>
              <div className="text-[10px] text-muted">ราคาเริ่มต้น</div>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted text-center">
          💡 ทุกชิ้นในผังสามารถย้าย ลบ เปลี่ยนสี หมุน หรือดาวน์โหลดเป็นรูปภาพ PNG ได้ทันทีหลังกดสร้าง
        </p>
      </div>
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
