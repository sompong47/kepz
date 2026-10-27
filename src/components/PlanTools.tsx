"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  adjustPrices, deletePlanVersion, listPlanVersions, removeFloorBg, renumberAssets, restorePlanVersion, savePlanVersion, uploadFloorBg,
} from "@/lib/actions";
import { CATEGORIES, FEATURES, PERIOD, baht, dimText, fmtDate, toM, toPx, type Category } from "@/lib/domain";
import type { FPAsset, FPFeature, FPFloor } from "@/lib/floor";

/* =====================================================================
 * มุมมองสีของผัง (สถานะ / ค้างชำระ / วันหมดสัญญา / ราคา)
 * ===================================================================== */
export type ColorMode = "status" | "overdue" | "expiry" | "price";
const DAY = 86400000;
const NONE = { bg: "#f5f5f4", border: "#d6d3d1" };

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

/** สีของห้องตามมุมมองที่เลือก; null = ใช้สีสถานะปกติ */
export function paint(a: FPAsset, mode: ColorMode, range: [number, number], now: number): { bg: string; border: string; tag?: string } | null {
  if (mode === "status") return null;
  if (mode === "price") {
    if (a.price <= 0) return NONE;
    const t = range[1] > range[0] ? (a.price - range[0]) / (range[1] - range[0]) : 0.5;
    return { bg: mix("#fef9c3", "#f97316", t), border: mix("#facc15", "#9a3412", t) };
  }
  const l = a.lease;
  if (mode === "overdue") {
    if (!l) return NONE;
    const late = l.payments.filter((p) => !p.paid && p.due < now);
    if (late.length) return { bg: "#fee2e2", border: "#dc2626", tag: `ค้าง ${late.length} งวด` };
    if (l.payments.some((p) => !p.paid && p.due < now + 7 * DAY)) return { bg: "#fef3c7", border: "#d97706", tag: "ใกล้ครบกำหนด" };
    return { bg: "#dcfce7", border: "#16a34a" };
  }
  if (!a.endDate) return NONE;
  const d = Math.ceil((a.endDate - now) / DAY);
  const [bg, border] = d <= 7 ? ["#fee2e2", "#dc2626"] : d <= 30 ? ["#ffedd5", "#ea580c"] : d <= 90 ? ["#fef9c3", "#ca8a04"] : ["#dcfce7", "#16a34a"];
  return { bg, border, tag: `เหลือ ${d} วัน` };
}

const LEGEND: Record<Exclude<ColorMode, "status">, [string, string][]> = {
  overdue: [["#dc2626", "ค้างชำระ"], ["#d97706", "ครบกำหนดใน 7 วัน"], ["#16a34a", "จ่ายตรงเวลา"], ["#d6d3d1", "ไม่มีผู้เช่า"]],
  expiry: [["#dc2626", "≤ 7 วัน"], ["#ea580c", "≤ 30 วัน"], ["#ca8a04", "≤ 90 วัน"], ["#16a34a", "> 90 วัน"], ["#d6d3d1", "ว่าง"]],
  price: [["#facc15", "ถูก"], ["#f97316", "แพง"], ["#d6d3d1", "ยังไม่ตั้งราคา"]],
};

export function ColorModeBar({ mode, onChange, range }: { mode: ColorMode; onChange: (m: ColorMode) => void; range: [number, number] }) {
  const modes: [ColorMode, string][] = [["status", "สถานะ"], ["overdue", "ค้างชำระ"], ["expiry", "วันหมดสัญญา"], ["price", "ราคา"]];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">🎨 มุมมองสี:</span>
      <div className="inline-flex rounded-lg border border-line bg-panel p-0.5">
        {modes.map(([m, label]) => (
          <button key={m} type="button" onClick={() => onChange(m)} className={`rounded-md px-2.5 py-1 cursor-pointer ${mode === m ? "bg-ink text-white font-medium" : "text-ink2 hover:bg-panel2"}`}>{label}</button>
        ))}
      </div>
      {mode !== "status" && (
        <span className="flex flex-wrap items-center gap-2.5 text-muted">
          {LEGEND[mode].map(([c, t]) => <span key={t} className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: c }} />{t}</span>)}
          {mode === "price" && range[1] > 0 && <span>({baht(range[0])} – {baht(range[1])})</span>}
        </span>
      )}
    </div>
  );
}

/* =====================================================================
 * ตั้งรหัสใหม่ทั้งชุด
 * ===================================================================== */
/** เรียงห้องเป็นแถว (บน→ล่าง แล้วซ้าย→ขวา) หรือเป็นคอลัมน์ */
function orderUnits(units: FPAsset[], by: "rows" | "cols") {
  const c = units.map((u) => ({ id: u.id, x: u.x + u.w / 2, y: u.y + u.h / 2, s: by === "rows" ? u.h : u.w }));
  const major = (p: (typeof c)[number]) => (by === "rows" ? p.y : p.x), minor = (p: (typeof c)[number]) => (by === "rows" ? p.x : p.y);
  const tol = (c.reduce((n, p) => n + p.s, 0) / Math.max(1, c.length)) / 2;
  const lines: (typeof c)[] = [];
  for (const p of [...c].sort((a, b) => major(a) - major(b))) {
    const line = lines.find((l) => Math.abs(major(l[0]) - major(p)) <= tol);
    if (line) line.push(p); else lines.push([p]);
  }
  return lines.flatMap((l) => l.sort((a, b) => minor(a) - minor(b)).map((p) => p.id));
}

export function RenumberBox({ shopId, units, onDone }: { shopId: string; units: FPAsset[]; onDone: (msg: string) => void }) {
  const common = units.map((u) => u.code.match(/^\D*/)?.[0] ?? "").reduce((a, b) => (a === b ? a : ""), units[0]?.code.match(/^\D*/)?.[0] ?? "");
  const [prefix, setPrefix] = useState(common || "A");
  const [startNo, setStartNo] = useState(1);
  const [pad, setPad] = useState(2);
  const [by, setBy] = useState<"rows" | "cols">("rows");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const preview = `${prefix}${String(startNo).padStart(pad, "0")} … ${prefix}${String(startNo + units.length - 1).padStart(pad, "0")}`;
  const apply = () => start(async () => {
    const r = await renumberAssets(shopId, orderUnits(units, by), { prefix, start: startNo, pad });
    setErr(r?.error ?? null);
    if (!r?.error) onDone(`ตั้งรหัสใหม่ ${units.length} รายการแล้ว (${preview})`);
  });
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <div className="text-xs font-medium text-ink2">🔢 ตั้งรหัสใหม่ทั้งชุด ({units.length} รายการ)</div>
      <div className="grid grid-cols-3 gap-1.5">
        <label><span className="label">คำนำหน้า</span><input value={prefix} maxLength={5} onChange={(e) => setPrefix(e.target.value)} className="input !py-1" /></label>
        <label><span className="label">เริ่มที่</span><input type="number" min={0} value={startNo} onChange={(e) => setStartNo(+e.target.value)} className="input !py-1" /></label>
        <label><span className="label">จำนวนหลัก</span><select value={pad} onChange={(e) => setPad(+e.target.value)} className="input !py-1">{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-muted">เรียงตาม</span>
        {([["rows", "แถว (ซ้าย→ขวา)"], ["cols", "คอลัมน์ (บน→ล่าง)"]] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setBy(k)} className={`rounded-md px-2 py-0.5 cursor-pointer ${by === k ? "bg-ink text-white" : "bg-panel2 text-ink2"}`}>{t}</button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">ตัวอย่าง: {preview}</span>
        <button type="button" className="btn !py-1 !px-3 text-xs" disabled={pending || !units.length} onClick={apply}>{pending ? "กำลังตั้ง…" : "ตั้งรหัส"}</button>
      </div>
      {err && <p className="text-[11px] text-danger">{err}</p>}
    </div>
  );
}

/* =====================================================================
 * ปรับราคาหลายช่อง (เลือกหลายช่อง หรือทั้งโซน)
 * ===================================================================== */
export function PriceAdjust({ shopId, ids, title, onDone }: { shopId: string; ids: string[]; title: string; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<"pct" | "add" | "set">("pct");
  const [value, setValue] = useState("10");
  const [pending, start] = useTransition();
  const apply = () => {
    const v = Number(value);
    if (!Number.isFinite(v) || value === "") return;
    start(async () => {
      const r = await adjustPrices(shopId, ids, { mode, value: v });
      onDone(`ปรับราคา ${r.updated} รายการแล้ว`);
    });
  };
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <div className="text-xs font-medium text-ink2">💰 {title}</div>
      <div className="flex gap-1.5">
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="input !py-1 !w-auto">
          <option value="pct">ขึ้น/ลด %</option>
          <option value="add">บวก/ลบ บาท</option>
          <option value="set">ตั้งเป็น (บาท)</option>
        </select>
        <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="input !py-1" placeholder={mode === "pct" ? "เช่น 10 หรือ -5" : "บาท"} />
        <button type="button" className="btn !py-1 !px-3 text-xs shrink-0" disabled={pending || !ids.length} onClick={apply}>{pending ? "…" : "ใช้"}</button>
      </div>
    </div>
  );
}

/* =====================================================================
 * รูปแบบแปลน/ภาพถ่ายเป็นพื้นหลัง
 * ===================================================================== */
export function BgPanel({ shopId, floor, onPatch, onReset, bgEdit, setBgEdit, calibrating, setCalibrating }: {
  shopId: string; floor: FPFloor; onPatch: (p: Partial<FPFloor>) => void; onReset: () => void;
  bgEdit: boolean; setBgEdit: (v: boolean) => void; calibrating: boolean; setCalibrating: (v: boolean) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const has = !!floor.bgImage && !!floor.bgW && !!floor.bgH;
  const upload = (file?: File) => {
    if (!file) return;
    start(async () => {
      setErr(null);
      const bmp = await createImageBitmap(file).catch(() => null);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("iw", String(bmp?.width ?? 1));
      fd.append("ih", String(bmp?.height ?? 1));
      const r = await uploadFloorBg(shopId, floor.id, fd);
      if (r?.error) setErr(r.error); else onReset();
      if (input.current) input.current.value = "";
    });
  };
  const ratio = has ? floor.bgH! / floor.bgW! : 1;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">อัปโหลดแบบแปลนอาคาร ภาพถ่ายดาวเทียม หรือรูปมุมสูง แล้ววาด{"ช่อง"}ทับตามของจริง · ใช้ “📏 เทียบสเกล” ให้รูปตรงกับขนาดเมตรจริง</p>
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" className="btn !py-1.5 text-xs" disabled={pending} onClick={() => input.current?.click()}>{pending ? "กำลังอัปโหลด…" : has ? "🔄 เปลี่ยนรูป" : "🖼 อัปโหลดรูปพื้นหลัง"}</button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
        {has && (
          <>
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={floor.bgShow !== false} onChange={(e) => onPatch({ bgShow: e.target.checked })} className="size-3.5 accent-ink" /> แสดงรูป</label>
            <label className="text-xs w-40"><span className="label">ความจาง {floor.bgOpacity ?? 50}%</span>
              <input type="range" min={5} max={100} value={floor.bgOpacity ?? 50} onChange={(e) => onPatch({ bgOpacity: +e.target.value })} className="w-full accent-[#111]" />
            </label>
            <label className="w-24"><span className="label">กว้าง (ม.)</span>
              <input key={floor.bgW} type="number" step={0.5} min={1} defaultValue={toM(floor.bgW!)} className="input !py-1"
                onBlur={(e) => { const w = toPx(+e.target.value); if (w > 0 && w !== floor.bgW) onPatch({ bgW: w, bgH: Math.round(w * ratio) }); }} />
            </label>
            <label className="w-20"><span className="label">X (ม.)</span><input key={`x${floor.bgX}`} type="number" step={0.5} defaultValue={toM(floor.bgX ?? 0)} className="input !py-1" onBlur={(e) => onPatch({ bgX: toPx(+e.target.value) })} /></label>
            <label className="w-20"><span className="label">Y (ม.)</span><input key={`y${floor.bgY}`} type="number" step={0.5} defaultValue={toM(floor.bgY ?? 0)} className="input !py-1" onBlur={(e) => onPatch({ bgY: toPx(+e.target.value) })} /></label>
            <button type="button" className={`${bgEdit ? "btn-dark" : "btn-ghost"} !py-1.5 text-xs`} onClick={() => { setBgEdit(!bgEdit); setCalibrating(false); }}>{bgEdit ? "✓ เสร็จการจัดรูป" : "✥ ลากจัดตำแหน่ง/ขนาด"}</button>
            <button type="button" className={`${calibrating ? "btn-dark" : "btn-ghost"} !py-1.5 text-xs`} onClick={() => { setCalibrating(!calibrating); setBgEdit(false); }}>{calibrating ? "ยกเลิกเทียบสเกล" : "📏 เทียบสเกล"}</button>
            <button type="button" className="btn-ghost !py-1.5 text-xs !text-danger" disabled={pending} onClick={() => { if (confirm("ลบรูปพื้นหลังของชั้นนี้?")) start(async () => { await removeFloorBg(shopId, floor.id); onReset(); }); }}>ลบรูป</button>
          </>
        )}
      </div>
      {calibrating && <p className="text-xs rounded-lg bg-brand/15 px-3 py-2">📏 คลิกจุดที่ 1 และจุดที่ 2 บนรูป (เช่น หัว-ท้ายของช่องจอดที่รู้ความยาว) แล้วกรอกระยะจริงเป็นเมตร ระบบจะย่อ/ขยายรูปให้ตรงสเกลผัง</p>}
      {bgEdit && <p className="text-xs rounded-lg bg-sky-100 px-3 py-2">✥ ลากรูปเพื่อย้าย · ลากมุมขวาล่างเพื่อย่อ/ขยาย (คงสัดส่วน)</p>}
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}

/* =====================================================================
 * บันทึกเวอร์ชันผัง
 * ===================================================================== */
type Version = Awaited<ReturnType<typeof listPlanVersions>>[number];
export function VersionsPanel({ shopId, floorId, onRestored }: { shopId: string; floorId: string; onRestored: (msg: string) => void }) {
  const [list, setList] = useState<Version[] | null>(null);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const load = () => start(async () => setList(await listPlanVersions(shopId, floorId)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [floorId]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-48"><span className="label">ชื่อเวอร์ชัน (ไม่บังคับ)</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ก่อนปรับโซน VIP" className="input !py-1.5" /></label>
        <button type="button" className="btn !py-1.5 text-xs" disabled={pending} onClick={() => start(async () => { await savePlanVersion(shopId, floorId, name); setName(""); setList(await listPlanVersions(shopId, floorId)); })}>💾 บันทึกเวอร์ชันนี้</button>
      </div>
      <p className="text-[11px] text-muted">เก็บผังของชั้นนี้ (ตำแหน่ง ขนาด ราคา รหัส องค์ประกอบ รูปพื้นหลัง) ไว้ย้อนกลับได้ · เก็บล่าสุด 30 เวอร์ชัน · ก่อนกู้คืนระบบจะบันทึกผังปัจจุบันให้อัตโนมัติ · {"ห้อง"}ที่มีสัญญาอยู่จะไม่ถูกลบ</p>
      {list === null ? <p className="text-xs text-muted">กำลังโหลด…</p> : !list.length ? <p className="text-xs text-muted">ยังไม่มีเวอร์ชันที่บันทึกไว้</p> : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {list.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
              <div><b>{v.name}</b> <span className="text-muted">· {new Date(v.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} · {v.units} รายการเช่า · {v.elements} องค์ประกอบ</span></div>
              <span className="flex gap-1.5">
                <button type="button" className="btn-ghost !py-1 !px-2 text-xs" disabled={pending} onClick={() => {
                  if (!confirm(`กู้ผังกลับเป็น “${v.name}”? (ผังปัจจุบันจะถูกบันทึกเป็นเวอร์ชันไว้ก่อน)`)) return;
                  start(async () => {
                    const r = await restorePlanVersion(shopId, v.id);
                    setList(await listPlanVersions(shopId, floorId));
                    onRestored(r.error ?? (r.skipped?.length ? `กู้คืนแล้ว · คงไว้ ${r.skipped.length} รายการที่มีสัญญา: ${r.skipped.join(", ")}` : `กู้คืน “${v.name}” แล้ว`));
                  });
                }}>↺ กู้คืน</button>
                <button type="button" className="btn-ghost !py-1 !px-2 text-xs !text-danger" disabled={pending} onClick={() => start(async () => { await deletePlanVersion(shopId, v.id); setList(await listPlanVersions(shopId, floorId)); })}>ลบ</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =====================================================================
 * หน้าต่างคีย์ลัด
 * ===================================================================== */
const KEYS: [string, string][] = [
  ["ลากชิ้นงาน", "ย้าย (มีเส้นนำช่วยจัดแนว · กด Alt ค้าง = ปิดเส้นนำ)"],
  ["ลากบนที่ว่าง", "ตีกรอบเลือกหลายชิ้น"],
  ["Shift / Ctrl + คลิก", "เลือกเพิ่ม / เอาออก"],
  ["Ctrl + A", "เลือกทั้งชั้น"],
  ["Ctrl + C / X / V", "คัดลอก / ตัด / วาง"],
  ["Ctrl + Z / Ctrl + Y", "เลิกทำ / ทำซ้ำ"],
  ["Delete", "ลบที่เลือก"],
  ["← ↑ → ↓", "เลื่อนทีละ 0.5 ม."],
  ["R / Shift + R", "หมุน +90° / −90°"],
  ["Ctrl + G / Ctrl + Shift + G", "จับกลุ่ม / แยกกลุ่ม"],
  ["L", "ล็อก / ปลดล็อกที่เลือก"],
  ["Esc", "ยกเลิกการเลือก"],
  ["Ctrl + ล้อเมาส์ · + / − / 0", "ซูมเข้า / ออก / พอดี"],
  ["Space + ลาก", "เลื่อนผัง"],
  ["?", "เปิด/ปิดหน้าต่างนี้"],
];
export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="card max-w-lg w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">⌨️ คีย์ลัดหน้าแก้ผัง</h3>
          <button type="button" className="btn-ghost !py-1 !px-2.5 text-xs" onClick={onClose}>ปิด (Esc)</button>
        </div>
        <ul className="divide-y divide-line text-sm">
          {KEYS.map(([k, d]) => (
            <li key={k} className="flex items-center justify-between gap-3 py-1.5">
              <kbd className="rounded-md border border-line bg-panel2 px-2 py-0.5 text-xs font-mono whitespace-nowrap">{k}</kbd>
              <span className="text-ink2 text-right">{d}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted">คีย์ลัดใช้ได้ทั้งแป้นภาษาไทยและอังกฤษ</p>
      </div>
    </div>
  );
}

/* =====================================================================
 * แชร์ & ดาวน์โหลดผังร้านสไตล์ Canva (Export PNG โปสเตอร์ / ผังล้วน / พิมพ์ PDF / คัดลอกลิงก์)
 * ===================================================================== */
export type CanvasTheme = "warm" | "white" | "blueprint" | "concrete";
export const CANVAS_THEMES: Record<CanvasTheme, { label: string; bg: string; grid: string; text: string }> = {
  warm: { label: "ครีมมาตรฐาน", bg: "#faf8f2", grid: "#ece8dc", text: "#111111" },
  white: { label: "ขาวมินิมอล", bg: "#ffffff", grid: "#f1f5f9", text: "#111111" },
  blueprint: { label: "พิมพ์เขียว (Blueprint)", bg: "#0f2942", grid: "#1e4976", text: "#e0f2fe" },
  concrete: { label: "ลานปูน / ดาร์ก", bg: "#262626", grid: "#383838", text: "#f5f5f5" },
};

export function ShareExportModal({
  shopId,
  shopTitle,
  category,
  unit,
  floor,
  assets,
  features,
  theme,
  onClose,
}: {
  shopId: string;
  shopTitle: string;
  category: Category;
  unit: string;
  floor: FPFloor;
  assets: FPAsset[];
  features: FPFeature[];
  theme: CanvasTheme;
  onClose: () => void;
}) {
  const [showPrices, setShowPrices] = useState(true);
  const [showSizes, setShowSizes] = useState(true);
  const [showTenants, setShowTenants] = useState(false);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [customSubtitle, setCustomSubtitle] = useState(`อัปเดตผังและสถานะว่างล่าสุด · ${fmtDate(Date.now())}`);
  const [contactText, setContactText] = useState("สนใจเช่า/จองตำแหน่ง ติดต่อสอบถามได้ทันที");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/shops/${shopId}` : `/shops/${shopId}`;
  const openAssets = assets.filter((a) => a.listed || a.price > 0);
  const vacantCount = openAssets.filter((a) => a.state === "VACANT").length;
  const occupiedCount = openAssets.length - vacantCount;

  // วาดผังลงบน HTML5 Canvas ทั้งสำหรับพรีวิวและดาวน์โหลด PNG ความละเอียดสูง
  useEffect(() => {
    const cvs = previewRef.current;
    if (!cvs) return;
    const scale = 2; // 2x Retina คมชัดสูง
    const pad = 40;
    const headerH = includeHeader ? 130 : 0;
    const footerH = includeHeader ? 84 : 0;
    const totalW = floor.w + pad * 2;
    const totalH = floor.h + pad * 2 + headerH + footerH;

    cvs.width = totalW * scale;
    cvs.height = totalH * scale;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);

    const th = CANVAS_THEMES[theme];
    // พื้นหลังโปสเตอร์รวม
    ctx.fillStyle = includeHeader ? "#111111" : th.bg;
    ctx.fillRect(0, 0, totalW, totalH);

    // ส่วนหัวโปสเตอร์ (Header)
    if (includeHeader) {
      ctx.fillStyle = "#ffc700";
      ctx.beginPath();
      ctx.roundRect(pad, 26, 48, 48, 12);
      ctx.fill();
      ctx.fillStyle = "#111111";
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("k.", pad + 24, 51);

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(shopTitle || `ผัง${CATEGORIES[category].label}`, pad + 64, 42);

      ctx.fillStyle = "#d4d4d8";
      ctx.font = "15px sans-serif";
      ctx.fillText(`${floor.name} (${toM(floor.w)}×${toM(floor.h)} ม.) · ${customSubtitle}`, pad + 64, 72);

      // ป้ายสรุปจำนวน ว่าง / เต็ม ด้านขวาบน
      const summaryText = `ว่างพร้อมเช่า ${vacantCount} ${unit}   |   มีผู้เช่าแล้ว ${occupiedCount} ${unit}`;
      ctx.font = "bold 15px sans-serif";
      const sw = ctx.measureText(summaryText).width + 36;
      ctx.fillStyle = "#27272a";
      ctx.beginPath();
      ctx.roundRect(totalW - pad - sw, 32, sw, 42, 21);
      ctx.fill();
      ctx.fillStyle = "#4ade80";
      ctx.textAlign = "center";
      ctx.fillText(summaryText, totalW - pad - sw / 2, 53);

      // แถบ Legend สัญลักษณ์สี
      const legends: [string, string, string][] = [
        ["#ffffff", "#16a34a", `ว่างพร้อมเช่า (${vacantCount})`],
        ["#ffc700", "#b45309", `มีผู้เช่า / จองแล้ว (${occupiedCount})`],
        ["#fb923c", "#ea580c", "ใกล้หมดสัญญา"],
      ];
      let lx = pad;
      const ly = 105;
      ctx.textAlign = "left";
      ctx.font = "13px sans-serif";
      for (const [bg, stroke, label] of legends) {
        ctx.fillStyle = bg;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(lx, ly - 8, 16, 16, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e4e4e7";
        ctx.fillText(label, lx + 24, ly);
        lx += ctx.measureText(label).width + 52;
      }
    }

    // พื้นที่วาดผัง (Canvas Area)
    const ox = pad;
    const oy = headerH + pad / 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ox, oy, floor.w, floor.h, 16);
    ctx.clip();

    ctx.fillStyle = th.bg;
    ctx.fillRect(ox, oy, floor.w, floor.h);

    // เส้นตารางบางๆ
    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= floor.w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(ox + x, oy);
      ctx.lineTo(ox + x, oy + floor.h);
      ctx.stroke();
    }
    for (let y = 0; y <= floor.h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + y);
      ctx.lineTo(ox + floor.w, oy + y);
      ctx.stroke();
    }

    // วาดองค์ประกอบผัง (Features)
    const drawFeat = (f: FPFeature) => {
      ctx.save();
      const cx = ox + f.x + f.w / 2;
      const cy = oy + f.y + f.h / 2;
      ctx.translate(cx, cy);
      if (f.rot) ctx.rotate((f.rot * Math.PI) / 180);

      const x = -f.w / 2;
      const y = -f.h / 2;
      const name = f.label ?? FEATURES[f.kind]?.label ?? f.kind;

      if (f.kind === "ZONE") {
        const c = f.color || "#9ca3af";
        ctx.fillStyle = f.color ? `${f.color}18` : "rgba(255,199,0,0.08)";
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.roundRect(x, y, f.w, f.h, 12);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#111111";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(name, x + 10, y + 8);
      } else if (f.kind === "ROAD") {
        ctx.fillStyle = f.color || "#dcdad2";
        ctx.beginPath();
        ctx.roundRect(x, y, f.w, f.h, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 12]);
        ctx.beginPath();
        if (f.w >= f.h) {
          ctx.moveTo(x + 8, 0);
          ctx.lineTo(x + f.w - 8, 0);
        } else {
          ctx.moveTo(0, y + 8);
          ctx.lineTo(0, y + f.h - 8);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (f.label) {
          ctx.fillStyle = "#333333";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(f.label, 0, 0);
        }
      } else if (f.kind === "WATER") {
        ctx.fillStyle = "#e0f2fe";
        ctx.strokeStyle = "#7dd3fc";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, f.w, f.h, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#0369a1";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`🌊 ${name}`, x + f.w - 10, y + f.h - 8);
      } else if (f.kind === "GREEN") {
        ctx.fillStyle = "#dcfce7";
        ctx.strokeStyle = "#4ade80";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, f.w, f.h, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#15803d";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`🌿 ${name}`, 0, 0);
      } else if (f.kind === "TEXT") {
        ctx.fillStyle = f.color || th.text;
        ctx.font = `bold ${Math.max(12, Math.min(36, Math.round(f.h * 0.6)))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, 0, 0);
      } else if (f.kind === "WALL" || f.kind === "PILLAR") {
        ctx.fillStyle = f.color || "#333333";
        ctx.fillRect(x, y, f.w, f.h);
      } else {
        ctx.fillStyle = f.kind === "ENTRANCE" ? "#dcfce7" : f.kind === "TOILET" ? "#e0f2fe" : "#fef9c3";
        ctx.strokeStyle = f.kind === "ENTRANCE" ? "#16a34a" : f.kind === "TOILET" ? "#0284c7" : "#ca8a04";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, f.w, f.h, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#111111";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, 0, 0);
      }
      ctx.restore();
    };

    features.filter((f) => FEATURES[f.kind]?.back).forEach(drawFeat);

    // วาดห้อง/ล็อกเช่า (Assets)
    const FILL_MAP = { VACANT: "#ffffff", OCCUPIED: "#ffc700", EXPIRING: "#fb923c", PENDING: "#38bdf8" };
    const STROKE_MAP = { VACANT: "#16a34a", OCCUPIED: "#b45309", EXPIRING: "#ea580c", PENDING: "#0284c7" };

    for (const a of assets) {
      ctx.save();
      const cx = ox + a.x + a.w / 2;
      const cy = oy + a.y + a.h / 2;
      ctx.translate(cx, cy);
      if (a.rot) ctx.rotate((a.rot * Math.PI) / 180);

      const x = -a.w / 2;
      const y = -a.h / 2;
      const unlisted = !a.listed && a.state === "VACANT";

      ctx.fillStyle = unlisted ? "#f5f5f4" : FILL_MAP[a.state];
      ctx.strokeStyle = unlisted ? "#bdbdbd" : STROKE_MAP[a.state];
      ctx.lineWidth = 2.5;
      if (unlisted) ctx.setLineDash([5, 4]);

      ctx.beginPath();
      if (a.shape === "CIRCLE") {
        ctx.ellipse(0, 0, a.w / 2, a.h / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.roundRect(x, y, a.w, a.h, 9);
      }
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      // ข้อความด้านในกล่อง
      ctx.fillStyle = "#111111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines: { text: string; font: string; color: string }[] = [
        { text: a.code, font: `bold ${Math.max(11, Math.min(16, Math.round(a.w / 5)))}px sans-serif`, color: "#111111" },
      ];
      if (showTenants && a.lease?.tenant) {
        lines.push({ text: `👤 ${a.lease.tenant}`, font: "bold 10px sans-serif", color: "#7c2d12" });
      } else if (showSizes && a.h >= 46 && a.w >= 52) {
        lines.push({ text: a.size || dimText(a.w, a.h), font: "10px sans-serif", color: "#52525b" });
      }
      if (showPrices && a.price > 0 && a.h >= 60 && a.w >= 58) {
        lines.push({
          text: `${baht(a.price)}/${a.period === "DAY" ? "ว." : "ด."}`,
          font: "bold 10px sans-serif",
          color: a.state === "VACANT" ? "#15803d" : "#111111",
        });
      }

      const lineH = 14;
      const startY = -((lines.length - 1) * lineH) / 2;
      lines.forEach((ln, idx) => {
        ctx.font = ln.font;
        ctx.fillStyle = ln.color;
        ctx.fillText(ln.text, 0, startY + idx * lineH, a.w - 8);
      });

      ctx.restore();
    }

    features.filter((f) => !FEATURES[f.kind]?.back).forEach(drawFeat);
    ctx.restore();

    // กรอบรอบผัง
    ctx.strokeStyle = includeHeader ? "#3f3f46" : "#d4d4d8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(ox, oy, floor.w, floor.h, 16);
    ctx.stroke();

    // ส่วนท้ายโปสเตอร์ (Footer)
    if (includeHeader) {
      const fy = oy + floor.h + 36;
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`📞 ${contactText}`, pad, fy);

      ctx.fillStyle = "#a1a1aa";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`ดูผังสดออนไลน์: ${shareUrl}`, totalW - pad, fy);
    }
  }, [floor, assets, features, theme, showPrices, showSizes, showTenants, includeHeader, customSubtitle, contactText, shopTitle, category, unit, vacantCount, occupiedCount, shareUrl]);

  const downloadPng = () => {
    const cvs = previewRef.current;
    if (!cvs) return;
    setBusy(true);
    cvs.toBlob((blob) => {
      setBusy(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanName = (shopTitle || "kepz-plan").replace(/[^\wก-๙-]/g, "_");
      a.download = `${cleanName}_${floor.name}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="card max-w-4xl w-full space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div>
            <h3 className="font-bold text-lg">📤 แชร์ & ดาวน์โหลดผังร้าน (Canva Export)</h3>
            <p className="text-xs text-muted">ดาวน์โหลดเป็นรูปโปสเตอร์ความละเอียดสูงสำหรับโพสต์ Facebook / ส่ง LINE หรือคัดลอกลิงก์ให้ลูกค้าดูผังสด</p>
          </div>
          <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={onClose}>✕ ปิด</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          {/* พรีวิวภาพที่จะได้จริง */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-ink2 flex items-center justify-between">
              <span>👀 ตัวอย่างภาพที่จะดาวน์โหลด (ความละเอียดสูง 2x Retina)</span>
              <span className="text-muted">{floor.name}</span>
            </div>
            <div className="rounded-2xl border border-line bg-panel2 p-3 grid place-items-center overflow-hidden">
              <canvas ref={previewRef} className="max-h-[420px] w-auto max-w-full rounded-xl shadow-md" />
            </div>
          </div>

          {/* ตั้งค่าการแสดงผล & ปุ่มแชร์ */}
          <div className="space-y-3.5 text-sm">
            <div className="rounded-xl border border-line bg-panel2/60 p-3 space-y-2">
              <div className="font-semibold text-xs text-ink">1. เลือกข้อมูลที่ต้องการแสดงบนรูปผัง</div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={includeHeader} onChange={(e) => setIncludeHeader(e.target.checked)} className="size-4 accent-ink" />
                <span>ใส่กรอบโปสเตอร์ (ชื่อร้าน + สรุปยอดว่าง/เต็ม + แถบสีอธิบาย)</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} className="size-4 accent-ink" />
                <span>แสดงราคาเช่าบน{unit}</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={showSizes} onChange={(e) => setShowSizes(e.target.checked)} className="size-4 accent-ink" />
                <span>แสดงขนาด / ตร.ม. บน{unit}</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={showTenants} onChange={(e) => setShowTenants(e.target.checked)} className="size-4 accent-ink" />
                <span>แสดงชื่อผู้เช่าบนผัง (สำหรับปริ้นท์เก็บไว้ดูเอง)</span>
              </label>
            </div>

            {includeHeader && (
              <div className="space-y-2">
                <label className="block">
                  <span className="label">ข้อความหัวกระดาษ / วันที่อัปเดต</span>
                  <input value={customSubtitle} onChange={(e) => setCustomSubtitle(e.target.value)} className="input !py-1.5 text-xs" />
                </label>
                <label className="block">
                  <span className="label">ช่องทางติดต่อท้ายโปสเตอร์ (เบอร์โทร / LINE)</span>
                  <input value={contactText} onChange={(e) => setContactText(e.target.value)} className="input !py-1.5 text-xs" />
                </label>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <button type="button" onClick={downloadPng} disabled={busy} className="btn w-full justify-center !py-2.5 text-sm shadow-sm">
                {busy ? "กำลังสร้างไฟล์ภาพ…" : "⬇️ ดาวน์โหลดรูปผัง (PNG คมชัดสูง)"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const cvs = previewRef.current;
                  if (!cvs) return;
                  const dataUrl = cvs.toDataURL("image/png");
                  const w = window.open("", "_blank");
                  if (w) {
                    w.document.write(`<html><head><title>พิมพ์ผัง ${shopTitle}</title><style>@page{size:landscape;margin:10mm}body{margin:0;display:grid;place-items:center;height:100vh}img{max-width:100%;max-height:95vh;object-fit:contain}</style></head><body><img src="${dataUrl}" onload="window.print()"/></body></html>`);
                    w.document.close();
                  }
                }}
                className="btn-ghost w-full justify-center !py-2 text-xs"
              >
                🖨️ พิมพ์ผังขนาด A4 แนวนอน / บันทึกเป็น PDF
              </button>
            </div>

            <div className="border-t border-line pt-3 space-y-2">
              <div className="font-semibold text-xs text-ink">🔗 ลิงก์ดูผังสดออนไลน์ (ลูกค้าเปิดดูซูมผังได้โดยไม่ต้องล็อกอิน)</div>
              <div className="flex gap-1.5">
                <input readOnly value={shareUrl} className="input !py-1.5 text-xs bg-panel2 font-mono" />
                <button type="button" onClick={copyLink} className="btn-dark !py-1.5 !px-3 text-xs shrink-0">
                  {copied ? "✓ คัดลอกแล้ว" : "คัดลอกลิงก์"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

