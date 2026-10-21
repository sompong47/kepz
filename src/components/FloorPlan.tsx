"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addShape, saveLayout, updateAsset, duplicateAsset, markPaid, pasteItems,
  addFeature, saveFeature, setFeatureColor, duplicateFeature, deleteItems, addFloor, updateFloor, deleteFloor, generateLayout,
} from "@/lib/actions";
import {
  BILLING, CANVAS, FEATURES, LAYOUT_PRESET, MIN_ASSET_PX, areaText, dimText, toM, toPx, PERIOD, STATE_CLASS, STATE_LABEL, baht, fmtDate,
  type AssetState, type Category, type FeatureKind,
} from "@/lib/domain";
import type { FPAsset, FPFeature, FPFloor } from "@/lib/floor";
import { RentForm } from "./Forms";
import Photos from "./Photos";

type Mode = "move" | "rot" | "nw" | "ne" | "sw" | "se";
type Rect = { x: number; y: number; w: number; h: number };
type Box = Rect & { rot: number };

/** สแนปช็อตของห้อง/องค์ประกอบ ใช้ทั้งคัดลอก-วาง และเลิกทำ */
type Snap = Box & { id: string; floorId: string } & (
  | { t: "A"; code: string; size: string | null; price: number; period: "DAY" | "MONTH"; note: string | null; shape: "RECT" | "CIRCLE"; photos?: { file: string }[] }
  | { t: "F"; kind: FeatureKind; label: string | null; color?: string | null }
);
/** ประวัติสำหรับ Ctrl+Z / Ctrl+Y; id ในประวัติอาจถูกแทนด้วย id ใหม่หลังกู้คืน (ดู alias) */
type Op =
  | { t: "layout"; before: [string, Box][]; after: [string, Box][] }
  | { t: "create"; ids: string[]; snaps?: Snap[] }
  | { t: "delete"; snaps: Snap[] }
  | { t: "color"; before: [string, string | null][]; after: [string, string | null][] };
const HISTORY_MAX = 50;
/** โหมดแก้ไข: "plan" = วาดโครงสถานที่ (ผนัง ทางเดิน โซน ฯลฯ), "units" = วางพื้นที่เช่าลงบนผัง */
type Layer = "plan" | "units";
const GLYPH: Record<FeatureKind, string> = { ZONE: "⬚", ROAD: "═", WALL: "▬", ENTRANCE: "⇆", STAIRS: "☰", TOILET: "🚻", OFFICE: "▣", TEXT: "T" };
// คลิปบอร์ดอยู่ระดับโมดูล จึงคัดลอกจากชั้นหนึ่งไปวางอีกชั้นได้
let clipboard: Snap[] = [];
let pasteCount = 0;
const snap = (n: number) => Math.round(n / CANVAS.grid) * CANVAS.grid;
const norm = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;
const RAD = Math.PI / 180;
/** กรอบแนวตั้ง-แนวนอนที่ครอบรูปที่หมุนแล้ว */
function aabb(b: Box): Rect {
  const c = Math.abs(Math.cos(b.rot * RAD)), s = Math.abs(Math.sin(b.rot * RAD));
  const w = b.w * c + b.h * s, h = b.w * s + b.h * c;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}
/** ข้อความกลับหัวเมื่อหมุนเกิน 90° ให้หมุนกลับเพื่ออ่านง่าย */
const upright = (rot: number) => (rot > 90 && rot <= 270 ? "rotate(180deg)" : undefined);
const FILL: Record<AssetState, string> = { VACANT: "#e5e5e5", OCCUPIED: "#ffc700", EXPIRING: "#fb923c", PENDING: "#38bdf8" };

/** สีให้เลือกสำหรับองค์ประกอบผัง */
const PALETTE = ["#ffc700", "#f97316", "#dc2626", "#db2777", "#9333ea", "#2563eb", "#0284c7", "#0d9488", "#16a34a", "#a16207", "#757575", "#111111"];
const alpha = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
/** สีตัวอักษรบนพื้นสีนั้น ๆ (ดำหรือขาว ตามความสว่าง) */
const inkOn = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
};

/** หน้าตาขององค์ประกอบผังแต่ละชนิด (ถ้าตั้งสีเองจะใช้สีนั้นแทนสีตั้งต้น) */
function featureLook(f: FPFeature): { style: React.CSSProperties; text: string | null } {
  const name = f.label ?? FEATURES[f.kind].label;
  const horiz = f.w >= f.h;
  const c = f.color;
  if (c) {
    switch (f.kind) {
      case "ZONE":
        return { style: { border: `2px dashed ${c}`, backgroundColor: alpha(c, 0.1), borderRadius: 12, alignItems: "flex-start", justifyContent: "flex-start", padding: 6, color: "#111", fontSize: 13 }, text: name };
      case "ROAD":
        return {
          style: {
            backgroundColor: c, color: inkOn(c), fontSize: 12,
            backgroundImage: `repeating-linear-gradient(${horiz ? "90deg" : "180deg"}, rgba(255,255,255,.85) 0 14px, transparent 14px 28px)`,
            backgroundSize: horiz ? "100% 2px" : "2px 100%", backgroundPosition: "center", backgroundRepeat: "no-repeat",
          },
          text: f.label,
        };
      case "WALL":
        return { style: { backgroundColor: c, borderRadius: 2 }, text: null };
      case "STAIRS":
        return { style: { backgroundImage: `repeating-linear-gradient(0deg,${alpha(c, 0.15)} 0 8px,${alpha(c, 0.6)} 8px 10px)`, border: `1px solid ${c}`, borderRadius: 6, color: "#111", fontSize: 12 }, text: name };
      case "TEXT":
        return { style: { color: c, fontWeight: 700, fontSize: Math.max(11, Math.min(48, f.h * 0.6)), whiteSpace: "nowrap" }, text: name };
      default: // ENTRANCE / TOILET / OFFICE
        return { style: { backgroundColor: alpha(c, 0.18), border: `2px solid ${c}`, borderRadius: 8, color: "#111", fontSize: 12, fontWeight: 600 }, text: f.kind === "ENTRANCE" ? `⇆ ${name}` : f.kind === "TOILET" ? `🚻 ${name}` : name };
    }
  }
  switch (f.kind) {
    case "ZONE":
      return { style: { border: "2px dashed #bdbdbd", backgroundColor: "rgba(255,199,0,.06)", borderRadius: 12, alignItems: "flex-start", justifyContent: "flex-start", padding: 6, color: "#333", fontSize: 13 }, text: name };
    case "ROAD":
      return {
        style: {
          backgroundColor: "#dcdad2", color: "#555", fontSize: 12,
          backgroundImage: `repeating-linear-gradient(${horiz ? "90deg" : "180deg"}, #ffffff 0 14px, transparent 14px 28px)`,
          backgroundSize: horiz ? "100% 2px" : "2px 100%", backgroundPosition: "center", backgroundRepeat: "no-repeat",
        },
        text: f.label,
      };
    case "WALL":
      return { style: { backgroundColor: "#333333", borderRadius: 2 }, text: null };
    case "ENTRANCE":
      return { style: { backgroundColor: "#dcfce7", border: "2px solid #16a34a", borderRadius: 8, color: "#166534", fontSize: 12, fontWeight: 600 }, text: `⇆ ${name}` };
    case "STAIRS":
      return { style: { backgroundImage: "repeating-linear-gradient(0deg,#f1f1f1 0 8px,#c8c8c8 8px 10px)", border: "1px solid #bdbdbd", borderRadius: 6, color: "#333", fontSize: 12 }, text: name };
    case "TOILET":
      return { style: { backgroundColor: "#e0f2fe", border: "2px solid #0284c7", borderRadius: 8, color: "#075985", fontSize: 12 }, text: `🚻 ${name}` };
    case "OFFICE":
      return { style: { backgroundColor: "#f6f4ec", border: "2px solid #757575", borderRadius: 8, color: "#111", fontSize: 12 }, text: name };
    case "TEXT":
      return { style: { color: "#111", fontWeight: 700, fontSize: Math.max(11, Math.min(48, f.h * 0.6)), whiteSpace: "nowrap" }, text: name };
  }
}

export default function FloorPlan({ shopId, category, floors, assets, features, unit, editable, canRent }: {
  shopId: string; category: Category; floors: FPFloor[]; assets: FPAsset[]; features: FPFeature[]; unit: string; editable?: boolean; canRent?: boolean;
}) {
  const [items, setItems] = useState(assets);
  const [feats, setFeats] = useState(features);
  const [floorId, setFloorId] = useState(floors[0]?.id ?? "");
  const [selIds, setSelIds] = useState<string[]>([]);
  const sel = selIds.length === 1 ? selIds[0] : null;
  const setSel = (id: string | null) => setSelIds(id ? [id] : []);
  const [edit, setEdit] = useState(false);
  // ผังว่าง → เริ่มที่สร้างผังก่อน; มีผังแล้ว → เริ่มที่วางพื้นที่เช่า
  const [layer, setLayerState] = useState<Layer>(features.length ? "units" : "plan");
  const [gen, setGen] = useState(false);
  const [saving, setSaving] = useState<"" | "saving" | "saved">("");
  const [scale, setScale] = useState(1);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; sx: number; sy: number; group: { id: string; isAsset: boolean; o: Box }[]; last: Map<string, Box> | null } | null>(null);
  const marq = useRef<{ x0: number; y0: number; add: boolean } | null>(null);
  const [, start] = useTransition();

  const floor = floors.find((f) => f.id === floorId) ?? floors[0];
  const W = floor?.w ?? CANVAS.w, H = floor?.h ?? CANVAS.h;

  useEffect(() => setItems(assets), [assets]);
  useEffect(() => setFeats(features), [features]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);

  const isAsset = (id: string) => items.some((a) => a.id === id);
  const boxOf = (id: string): Box | undefined => items.find((a) => a.id === id) ?? feats.find((f) => f.id === id);
  const patchMany = (m: Map<string, Box>) => {
    setItems((l) => l.map((a) => (m.has(a.id) ? { ...a, ...m.get(a.id) } : a)));
    setFeats((l) => l.map((f) => (m.has(f.id) ? { ...f, ...m.get(f.id) } : f)));
  };
  const persist = (id: string, b: Box) => {
    setSaving("saving");
    const a = items.find((x) => x.id === id);
    return (a ? saveLayout(shopId, id, { ...b, shape: a.shape }) : saveFeature(shopId, id, b)).then(() => setSaving("saved"));
  };
  const persistMany = (m: Map<string, Box>) => { for (const [id, b] of m) persist(id, b); };

  /** เลื่อนชิ้นให้กรอบที่หมุนแล้วอยู่ในขอบผัง */
  const clampIn = (b: Box): Box => {
    const r = aabb(b);
    const dx = r.x < 0 ? -r.x : r.x + r.w > W ? W - r.x - r.w : 0, dy = r.y < 0 ? -r.y : r.y + r.h > H ? H - r.y - r.h : 0;
    return { ...b, x: Math.round(b.x + dx), y: Math.round(b.y + dy) };
  };
  /** ย้ายกลุ่มไป dx,dy โดยให้ทุกชิ้นอยู่ในขอบผัง */
  const shifted = (group: { id: string; o: Box }[], dx: number, dy: number) => {
    const rs = group.map((g) => aabb(g.o));
    const minX = Math.min(...rs.map((r) => r.x)), minY = Math.min(...rs.map((r) => r.y));
    const maxR = Math.max(...rs.map((r) => r.x + r.w)), maxB = Math.max(...rs.map((r) => r.y + r.h));
    const cx = Math.min(Math.max(dx, Math.ceil(-minX)), Math.floor(W - maxR)), cy = Math.min(Math.max(dy, Math.ceil(-minY)), Math.floor(H - maxB));
    return new Map(group.map((g) => [g.id, { ...g.o, x: g.o.x + cx, y: g.o.y + cy }]));
  };
  /** หมุนทั้งกลุ่มรอบจุดกึ่งกลางกลุ่ม (ทีละ ±90°) */
  const rotatedGroup = (group: { id: string; o: Box }[], deg: number) => {
    const rs = group.map((g) => aabb(g.o));
    const gx = (Math.min(...rs.map((r) => r.x)) + Math.max(...rs.map((r) => r.x + r.w))) / 2;
    const gy = (Math.min(...rs.map((r) => r.y)) + Math.max(...rs.map((r) => r.y + r.h))) / 2;
    const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
    return new Map(group.map((g) => {
      const ox = g.o.x + g.o.w / 2 - gx, oy = g.o.y + g.o.h / 2 - gy;
      const cx = gx + ox * c - oy * s, cy = gy + ox * s + oy * c;
      return [g.id, clampIn({ ...g.o, x: Math.round(cx - g.o.w / 2), y: Math.round(cy - g.o.h / 2), rot: norm(g.o.rot + deg) })];
    }));
  };
  const commitLayout = (group: { id: string; o: Box }[], m: Map<string, Box>) => {
    patchMany(m);
    persistMany(m);
    record({ t: "layout", before: group.filter((g) => m.has(g.id)).map((g) => [g.id, g.o]), after: [...m] });
  };
  const groupOf = (ids: string[]) => ids.flatMap((id) => { const o = boxOf(id); return o ? [{ id, o: { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot } }] : []; });
  const rotateBy = (ids: string[], deg: number) => { const g = groupOf(ids); if (g.length) commitLayout(g, rotatedGroup(g, deg)); };
  const rotateTo = (id: string, deg: number) => { const g = groupOf([id]); if (g.length) commitLayout(g, new Map([[id, clampIn({ ...g[0].o, rot: norm(deg) })]])); };

  const down = (e: React.PointerEvent, id: string, b: Box, mode: Mode) => {
    if (edit && !inLayer(id)) return;
    e.stopPropagation();
    setGen(false);
    // Shift/Ctrl + คลิก = เพิ่ม/เอาออกจากกลุ่มที่เลือก
    if (edit && mode === "move" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      setSelIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
      return;
    }
    const inGroup = mode === "move" && selIds.length > 1 && selIds.includes(id);
    if (!inGroup) setSel(id);
    if (!edit) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const ids = inGroup ? selIds : [id];
    const group = ids.flatMap((i) => { const o = i === id ? b : boxOf(i); return o ? [{ id: i, isAsset: isAsset(i), o: { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot } }] : []; });
    drag.current = { mode, sx: e.clientX, sy: e.clientY, group, last: null };
  };

  const toCanvas = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  // ลากบนพื้นที่ว่าง = ตีกรอบเลือกหลายชิ้น
  const bgDown = (e: React.PointerEvent) => {
    if (!edit || e.button !== 0) return setSel(null);
    const p = toCanvas(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    marq.current = { x0: p.x, y0: p.y, add };
    if (!add) setSelIds([]);
    setGen(false);
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const move = (e: React.PointerEvent) => {
    const m = marq.current;
    if (m) {
      const p = toCanvas(e);
      setMarquee({ x: Math.min(m.x0, p.x), y: Math.min(m.y0, p.y), w: Math.abs(p.x - m.x0), h: Math.abs(p.y - m.y0) });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / scale, dy = (e.clientY - d.sy) / scale;
    if (d.mode === "move") {
      d.last = shifted(d.group, snap(dx), snap(dy));
    } else if (d.mode === "rot") {
      // มุมจากจุดกึ่งกลางถึงเมาส์; ปัดทีละ 15° (กด Shift = หมุนอิสระ)
      const g = d.group[0], p = toCanvas(e);
      const deg = Math.atan2(p.y - (g.o.y + g.o.h / 2), p.x - (g.o.x + g.o.w / 2)) / RAD + 90;
      d.last = new Map([[g.id, clampIn({ ...g.o, rot: norm(e.shiftKey ? deg : Math.round(deg / 15) * 15) })]]);
    } else {
      // ปรับขนาดในแกนของรูป (รองรับรูปที่หมุนอยู่) โดยตรึงมุมตรงข้ามไว้กับที่
      const g = d.group[0];
      const min = g.isAsset ? MIN_ASSET_PX : 10;
      const { x, y, w, h, rot } = g.o;
      const c = Math.cos(rot * RAD), s = Math.sin(rot * RAD);
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      const sx = d.mode.includes("w") ? -1 : 1, sy = d.mode.includes("n") ? -1 : 1;
      const nw = Math.min(W, Math.max(min, snap(w + sx * lx))), nh = Math.min(H, Math.max(min, snap(h + sy * ly)));
      const ax = (-sx * w) / 2, ay = (-sy * h) / 2;
      const fx = x + w / 2 + ax * c - ay * s, fy = y + h / 2 + ax * s + ay * c;
      const bx = (sx * nw) / 2, by = (sy * nh) / 2;
      const ncx = fx + bx * c - by * s, ncy = fy + bx * s + by * c;
      d.last = new Map([[g.id, clampIn({ x: Math.round(ncx - nw / 2), y: Math.round(ncy - nh / 2), w: nw, h: nh, rot })]]);
    }
    patchMany(d.last);
  };
  const up = () => {
    if (marq.current) {
      const add = marq.current.add;
      marq.current = null;
      const r = marquee;
      setMarquee(null);
      if (!r || (r.w < 4 && r.h < 4)) return;
      const hit = (o: Box) => { const b = aabb(o); return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y; };
      // โซน/ทางเดินมักกว้างกว่าห้อง จึงต้องอยู่ในกรอบทั้งชิ้นถึงจะถูกเลือก
      const inside = (o: Box) => { const b = aabb(o); return b.x >= r.x && b.x + b.w <= r.x + r.w && b.y >= r.y && b.y + b.h <= r.y + r.h; };
      const ids = (layer === "units" ? onFloor.filter(hit) : fOnFloor.filter((f) => (FEATURES[f.kind].back ? inside(f) : hit(f)))).map((b) => b.id);
      setSelIds((l) => (add ? [...new Set([...l, ...ids])] : ids));
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (d?.last) {
      persistMany(d.last);
      record({ t: "layout", before: d.group.filter((g) => d.last!.has(g.id)).map((g) => [g.id, g.o]), after: [...d.last] });
    }
  };

  /* ---------- ประวัติ (เลิกทำ/ทำซ้ำ) และคลิปบอร์ด ---------- */
  const undoStack = useRef<Op[]>([]);
  const redoStack = useRef<Op[]>([]);
  const alias = useRef(new Map<string, string>());
  const busy = useRef(false);
  const [, bump] = useState(0);
  const resolve = (id: string) => {
    let x = id;
    for (let i = 0; i < 100 && alias.current.has(x); i++) x = alias.current.get(x)!;
    return x;
  };
  const record = (op: Op) => {
    undoStack.current.push(op);
    if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift();
    redoStack.current = [];
    bump((n) => n + 1);
  };
  const snapOf = (id: string): Snap | null => {
    const a = items.find((x) => x.id === id);
    if (a) return { t: "A", id, floorId: a.floorId, x: a.x, y: a.y, w: a.w, h: a.h, rot: a.rot, code: a.code, size: a.size, price: a.price, period: a.period, note: a.note, shape: a.shape };
    const f = feats.find((x) => x.id === id);
    return f ? { t: "F", id, floorId: f.floorId, x: f.x, y: f.y, w: f.w, h: f.h, rot: f.rot, kind: f.kind, label: f.label, color: f.color } : null;
  };
  /** ลบ แล้วคืนสแนปช็อตของที่ลบจริง (ห้องที่มีผู้เช่าจะถูกข้าม) */
  const removeIds = async (ids: string[]) => {
    const snaps = ids.map(snapOf).filter((s): s is Snap => !!s);
    if (!snaps.length) return [];
    const r = await deleteItems(shopId, snaps.map((s) => s.id));
    if (r.skipped.length) alert(`ข้าม ${r.skipped.length} ห้องที่มีสัญญาหรือคำขอเช่าค้างอยู่: ${r.skipped.join(", ")}`);
    const done = new Set(r.deletedIds);
    return snaps.filter((s) => done.has(s.id)).map((s) => (s.t === "A" ? { ...s, photos: r.photos.filter((p) => p.assetId === s.id).map((p) => ({ file: p.file })) } : s));
  };
  const restore = async (snaps: Snap[]) => {
    const ids = await pasteItems(shopId, snaps, true);
    snaps.forEach((s, i) => { const n = ids[i]; if (n) alias.current.set(s.id, n); });
    return ids.filter((i): i is string => !!i);
  };
  const applyLayout = (pairs: [string, Box][]) => {
    const m = new Map(pairs.map(([id, b]) => [resolve(id), b] as const).filter(([id]) => boxOf(id)));
    patchMany(m);
    persistMany(m);
    setSelIds([...m.keys()]);
  };
  const historyStep = (dir: "undo" | "redo") => {
    const from = dir === "undo" ? undoStack.current : redoStack.current;
    const to = dir === "undo" ? redoStack.current : undoStack.current;
    if (busy.current) return;
    const op = from.pop();
    if (!op) return;
    busy.current = true;
    start(async () => {
      try {
        if (op.t === "layout") applyLayout(dir === "undo" ? op.before : op.after);
        else if (op.t === "color") applyColors(dir === "undo" ? op.before : op.after);
        // create ย้อน = ลบ, ทำซ้ำ = กู้คืน; delete กลับกัน
        else if ((op.t === "create") === (dir === "undo")) {
          const ids = op.t === "create" ? op.ids : op.snaps.map((s) => s.id);
          const snaps = await removeIds(ids.map(resolve));
          op.snaps = snaps;
          setSelIds([]);
        } else {
          const snaps = op.snaps ?? [];
          setSelIds(await restore(snaps));
          if (op.t === "create") op.ids = snaps.map((s) => s.id);
        }
        to.push(op);
      } finally {
        busy.current = false;
        bump((n) => n + 1);
      }
    });
  };

  const removeWithUndo = (ids: string[]) => {
    if (!ids.length || busy.current) return;
    busy.current = true;
    start(async () => {
      try {
        const snaps = await removeIds(ids);
        if (snaps.length) record({ t: "delete", snaps });
        setSelIds([]);
      } finally { busy.current = false; }
    });
  };
  const removeSelected = () => removeWithUndo(selIds);
  const applyColors = (pairs: [string, string | null][]) => {
    const m = new Map(pairs.map(([id, c]) => [resolve(id), c] as const));
    setFeats((l) => l.map((f) => (m.has(f.id) ? { ...f, color: m.get(f.id)! } : f)));
    const groups = new Map<string | null, string[]>();
    for (const [id, c] of m) groups.set(c, [...(groups.get(c) ?? []), id]);
    setSaving("saving");
    Promise.all([...groups].map(([c, ids]) => setFeatureColor(shopId, ids, c))).then(() => setSaving("saved"));
  };
  /** เปลี่ยนสีองค์ประกอบผังที่เลือก (ห้องเช่าใช้สีตามสถานะ จึงไม่เปลี่ยน) */
  const setColor = (ids: string[], color: string | null) => {
    const fs = feats.filter((f) => ids.includes(f.id));
    if (!fs.length) return;
    applyColors(fs.map((f) => [f.id, color]));
    record({ t: "color", before: fs.map((f) => [f.id, f.color]), after: fs.map((f) => [f.id, color]) });
  };
  const copySelected = () => {
    clipboard = selIds.map(snapOf).filter((s): s is Snap => !!s);
    pasteCount = 0;
    setSaving("");
  };
  const paste = () => {
    if (!clipboard.length || !floor || busy.current) return;
    // วางชั้นเดียวกัน = เยื้องทีละ 1 ม.; ต่างชั้น = ตำแหน่งเดิม
    const off = clipboard.every((s) => s.floorId === floor.id) ? ++pasteCount * 20 : 0;
    const snaps = clipboard.map((s) => ({ ...s, floorId: floor.id, x: s.x + off, y: s.y + off }));
    busy.current = true;
    start(async () => {
      try {
        const ids = (await pasteItems(shopId, snaps, false)).filter((i): i is string => !!i);
        if (ids.length) { record({ t: "create", ids }); setSelIds(ids); }
      } finally { busy.current = false; }
    });
  };

  // คีย์ลัด: ลูกศรเลื่อน · Delete ลบ · Esc ยกเลิก · Ctrl+A เลือกทั้งชั้น · Ctrl+Z/Y เลิกทำ/ทำซ้ำ · Ctrl+C/X/V
  useEffect(() => {
    if (!edit) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (ctrl && k === "a") {
        e.preventDefault();
        return setSelIds((layer === "units" ? onFloor : fOnFloor).map((b) => b.id));
      }
      if (ctrl && k === "z") { e.preventDefault(); return historyStep(e.shiftKey ? "redo" : "undo"); }
      if (ctrl && k === "y") { e.preventDefault(); return historyStep("redo"); }
      if (ctrl && k === "v") { e.preventDefault(); return paste(); }
      if (!selIds.length) return;
      if (ctrl && k === "c") { e.preventDefault(); return copySelected(); }
      if (ctrl && k === "x") { e.preventDefault(); copySelected(); return removeSelected(); }
      if (e.key === "Escape") return setSelIds([]);
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); return removeSelected(); }
      if (!ctrl && k === "r") { e.preventDefault(); return rotateBy(selIds, e.shiftKey ? -90 : 90); }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!dir) return;
      e.preventDefault();
      const group = groupOf(selIds);
      commitLayout(group, shifted(group, dir[0] * CANVAS.grid, dir[1] * CANVAS.grid));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const run = (fn: () => Promise<string | null | undefined>) => start(async () => { const id = await fn(); if (id) { setSel(id); setGen(false); record({ t: "create", ids: [id] }); } });
  const toggleShape = (a: FPAsset) => {
    const shape = a.shape === "RECT" ? "CIRCLE" : "RECT";
    setItems((l) => l.map((x) => (x.id === a.id ? { ...x, shape } : x)));
    setSaving("saving");
    saveLayout(shopId, a.id, { ...a, shape }).then(() => setSaving("saved"));
  };
  const switchFloor = (id: string) => { setFloorId(id); setSel(null); setGen(false); };
  const setLayer = (l: Layer) => { setLayerState(l); setSelIds([]); setGen(false); };
  const inLayer = (id: string) => (layer === "units") === isAsset(id);

  const onFloor = items.filter((a) => a.floorId === floor?.id);
  const fOnFloor = feats.filter((f) => f.floorId === floor?.id);
  const back = fOnFloor.filter((f) => FEATURES[f.kind].back);
  const front = fOnFloor.filter((f) => !FEATURES[f.kind].back);
  const curAsset = items.find((a) => a.id === sel) ?? null;
  const curFeat = feats.find((f) => f.id === sel) ?? null;

  const handles = (id: string, b: Box) =>
    edit && sel === id && (
      <>
        {(["nw", "ne", "sw", "se"] as const).map((m) => (
          <span
            key={m}
            onPointerDown={(e) => down(e, id, b, m)}
            className="absolute size-3.5 rounded-sm bg-white border-2 border-black z-10"
            style={{ [m.includes("n") ? "top" : "bottom"]: -7, [m.includes("w") ? "left" : "right"]: -7, cursor: m === "nw" || m === "se" ? "nwse-resize" : "nesw-resize" }}
          />
        ))}
        <span className="absolute left-1/2 -top-6 h-6 w-0.5 -translate-x-1/2 bg-ink/60 pointer-events-none" />
        <span
          title="ลากเพื่อหมุน (Shift = อิสระ)"
          onPointerDown={(e) => down(e, id, b, "rot")}
          className="absolute left-1/2 -top-9 size-4 -translate-x-1/2 rounded-full bg-brand border-2 border-black z-10 cursor-grab active:cursor-grabbing"
        />
        {drag.current?.mode === "rot" && <span className="absolute left-1/2 -top-16 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white whitespace-nowrap" style={{ transform: `translateX(-50%) rotate(${-b.rot}deg)` }}>{b.rot}°</span>}
      </>
    );
  const renderFeature = (f: FPFeature) => {
    const { style, text } = featureLook(f);
    return (
      <div
        key={f.id}
        onPointerDown={(e) => down(e, f.id, f, "move")}
        className={`absolute flex items-center justify-center text-center leading-tight overflow-visible ${edit ? "cursor-move" : ""}`}
        style={{ left: f.x, top: f.y, width: f.w, height: f.h, transform: f.rot ? `rotate(${f.rot}deg)` : undefined, pointerEvents: edit && layer === "plan" ? "auto" : "none", outline: selIds.includes(f.id) ? "3px solid #111" : "none", outlineOffset: 2, ...style }}
      >
        {text && <span className="pointer-events-none" style={{ transform: upright(f.rot) }}>{text}</span>}
        {handles(f.id, f)}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {(floors.length > 1 || (editable && edit)) && (
        <div className="flex flex-wrap items-center gap-2">
          {floors.map((f) => (
            <button key={f.id} onClick={() => switchFloor(f.id)} className={`btn-ghost !py-1.5 ${f.id === floor?.id ? "pill-on" : ""}`}>{f.name}</button>
          ))}
          {editable && edit && <button className="btn-ghost !py-1.5 text-muted" onClick={() => start(async () => switchFloor(await addFloor(shopId)))}>+ เพิ่มชั้น/โซน</button>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <>
            {!edit ? (
              <button className="btn" onClick={() => setEdit(true)}>✎ แก้ไขผัง</button>
            ) : (
              <>
                {/* สลับโหมด: วาดโครงสถานที่ ↔ วางพื้นที่เช่า */}
                <div className="inline-flex rounded-xl border border-line bg-panel2 p-1">
                  {([["plan", "1", "สร้างผัง"], ["units", "2", `วาง${unit}`]] as const).map(([l, n, label]) => (
                    <button
                      key={l}
                      onClick={() => setLayer(l)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium cursor-pointer transition-colors ${layer === l ? "bg-ink text-white" : "text-ink2 hover:bg-panel"}`}
                    >
                      <span className={`grid place-items-center size-5 rounded-full text-xs ${layer === l ? "bg-brand text-ink" : "bg-line"}`}>{n}</span>{label}
                    </button>
                  ))}
                </div>
                <button className="btn-dark" onClick={() => { setEdit(false); setSelIds([]); setGen(false); }}>✓ เสร็จสิ้น</button>
                <button className="btn-ghost" title="เลิกทำ (Ctrl+Z)" disabled={!undoStack.current.length} onClick={() => historyStep("undo")}>↶</button>
                <button className="btn-ghost" title="ทำซ้ำ (Ctrl+Y)" disabled={!redoStack.current.length} onClick={() => historyStep("redo")}>↷</button>
              </>
            )}
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted">
          {(Object.keys(STATE_LABEL) as AssetState[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5"><i className={`inline-block size-2.5 rounded-full ${STATE_CLASS[k].split(" ")[0]}`} />{STATE_LABEL[k]}</span>
          ))}
        </div>
      </div>
      {edit && floor && (
        <div className="rounded-2xl border border-line bg-panel p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {layer === "plan" ? (
              <>
                <span className="text-sm font-medium mr-1">เพิ่มองค์ประกอบผัง:</span>
                {(Object.keys(FEATURES) as FeatureKind[]).map((k) => (
                  <button key={k} className="btn-ghost !py-1.5" onClick={() => run(() => addFeature(shopId, floor.id, k))}>
                    <span className="mr-1.5 w-4 text-center">{GLYPH[k]}</span>{FEATURES[k].label}
                  </button>
                ))}
              </>
            ) : (
              <>
                <span className="text-sm font-medium mr-1">เพิ่ม{unit}:</span>
                <button className="btn-ghost !py-1.5" onClick={() => run(() => addShape(shopId, floor.id, "RECT"))}>▭ สี่เหลี่ยม</button>
                <button className="btn-ghost !py-1.5" onClick={() => run(() => addShape(shopId, floor.id, "CIRCLE"))}>◯ วงกลม</button>
                <button className={`${gen ? "btn" : "btn-ghost"} !py-1.5`} onClick={() => { setGen(!gen); setSel(null); }}>⚡ วาง{unit}อัตโนมัติ</button>
              </>
            )}
          </div>
          <p className="text-xs text-muted">
            {layer === "plan" ? `วาดโครงสถานที่ก่อน (${unit}จะจางและล็อกไว้)` : "วางพื้นที่เช่าบนผัง (ผังถูกล็อก ลากผ่านได้โดยไม่ขยับผนัง/โซน)"}
            {" · "}ลากย้าย · ลากมุมปรับขนาด · จุดเหลืองหมุน (R = 90°) · ลากที่ว่างเลือกหลายชิ้น · Delete ลบ · Ctrl+C/X/V · Ctrl+Z/Y
            {saving === "saving" ? " · กำลังบันทึก…" : saving === "saved" ? " · บันทึกแล้ว ✓" : ""}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div ref={wrap} className="rounded-2xl border border-line overflow-hidden bg-white" style={{ height: H * scale }}>
          <div
            ref={canvas}
            onPointerDown={bgDown}
            onPointerMove={move}
            onPointerUp={up}
            className="relative origin-top-left touch-none select-none"
            style={{
              width: W, height: H, transform: `scale(${scale})`,
              backgroundImage: edit ? "linear-gradient(#efece2 1px,transparent 1px),linear-gradient(90deg,#efece2 1px,transparent 1px)" : "none",
              backgroundSize: `${CANVAS.grid * 2}px ${CANVAS.grid * 2}px`,
            }}
          >
            {back.map(renderFeature)}
            {onFloor.map((a) => (
              <div
                key={a.id}
                onPointerDown={(e) => down(e, a.id, a, "move")}
                className={`absolute flex flex-col items-center justify-center text-black font-semibold leading-tight transition-opacity ${edit ? "cursor-move" : "cursor-pointer"}`}
                style={{
                  ...(edit && layer === "plan" && { opacity: 0.25, pointerEvents: "none" }),
                  left: a.x, top: a.y, width: a.w, height: a.h, transform: a.rot ? `rotate(${a.rot}deg)` : undefined, background: FILL[a.state], borderRadius: a.shape === "CIRCLE" ? "9999px" : 10,
                  color: "#111", boxShadow: "inset 0 0 0 1px rgba(17,17,17,.12)", outline: selIds.includes(a.id) ? "3px solid #111" : "none", outlineOffset: 2,
                }}
              >
                <span className="flex flex-col items-center pointer-events-none" style={{ transform: upright(a.rot) }}>
                  <span style={{ fontSize: Math.max(11, Math.min(18, a.w / 5)) }}>{a.code}</span>
                  {a.h >= 50 && a.w >= 60 && <span className="text-[11px] font-normal opacity-80">{a.size || dimText(a.w, a.h)}</span>}
                </span>
                {handles(a.id, a)}
              </div>
            ))}
            {front.map(renderFeature)}
            {marquee && <div className="absolute border-2 border-brand bg-brand/10 pointer-events-none" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
            {!onFloor.length && !fOnFloor.length && (
              <p className="absolute inset-0 grid place-items-center text-muted">{!editable ? "ยังไม่มีผัง" : !edit ? "กด “แก้ไขผัง” เพื่อเริ่ม" : layer === "plan" ? "เริ่มจากวาดผนัง ทางเดิน หรือโซน จากแถบด้านบน" : `เพิ่ม${unit} หรือใช้ “วาง${unit}อัตโนมัติ”`}</p>
            )}
          </div>
        </div>

        {gen && floor ? (
          <GenPanel key={floor.id} shopId={shopId} floorId={floor.id} category={category} unit={unit} onDone={(ids) => { if (ids?.length) record({ t: "create", ids }); setGen(false); }} />
        ) : selIds.length > 1 ? (
          <div className="card space-y-3 text-sm self-start">
            <div className="text-lg font-bold">เลือก {selIds.length} รายการ</div>
            <p className="text-xs text-muted">
              {unit} {selIds.filter(isAsset).length} · องค์ประกอบผัง {selIds.filter((i) => !isAsset(i)).length}<br />
              ลากชิ้นใดก็ได้เพื่อย้ายทั้งกลุ่ม · ปุ่มลูกศรเลื่อน · R หมุน · Delete ลบ · Esc ยกเลิก · Shift/Ctrl+คลิก เพิ่ม/เอาออก
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => rotateBy(selIds, -90)}>⟲ 90°</button>
              <button className="btn-ghost" onClick={() => rotateBy(selIds, 90)}>⟳ 90°</button>
              <button className="btn-ghost !text-danger" onClick={removeSelected}>ลบที่เลือกทั้งหมด</button>
            </div>
            {selIds.some((i) => !isAsset(i)) && <ColorPicker value={null} onChange={(c) => setColor(selIds, c)} />}
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => setSelIds([])}>ยกเลิกการเลือก</button>
            </div>
          </div>
        ) : curFeat ? (
          <FeaturePanel key={curFeat.id} shopId={shopId} f={curFeat} onColor={(c) => setColor([curFeat.id], c)} onRotate={(d, abs) => (abs ? rotateTo(curFeat.id, d) : rotateBy([curFeat.id], d))} onDup={() => run(() => duplicateFeature(shopId, curFeat.id))} onRemove={() => removeWithUndo([curFeat.id])} />
        ) : curAsset || !(editable && edit && floor) || layer === "units" ? (
          <Panel key={curAsset?.id ?? "none"} shopId={shopId} a={curAsset} unit={unit} editable={!!editable} edit={edit} canRent={!!canRent}
            onShape={toggleShape} onRotate={(id, d, abs) => (abs ? rotateTo(id, d) : rotateBy([id], d))} onDup={(id) => run(() => duplicateAsset(shopId, id))} onRemove={(id) => removeWithUndo([id])} />
        ) : (
          <FloorPanel key={floor.id} shopId={shopId} floor={floor} canDelete={floors.length > 1} onDeleted={() => switchFloor(floors.find((f) => f.id !== floor.id)!.id)} />
        )}
      </div>
    </div>
  );
}

function Panel({ shopId, a, unit, editable, edit, canRent, onShape, onRotate, onDup, onRemove }: {
  shopId: string; a: FPAsset | null; unit: string; editable: boolean; edit: boolean; canRent: boolean;
  onShape: (a: FPAsset) => void; onRotate: (id: string, deg: number, absolute?: boolean) => void; onDup: (id: string) => void; onRemove: (id: string) => void;
}) {
  const [st, act, pending] = useActionState(updateAsset.bind(null, shopId, a?.id ?? ""), undefined);
  if (!a) return <div className="card text-sm text-muted self-start">แตะ{unit}ในผังเพื่อดูรายละเอียด สถานะ สัญญา และการชำระเงิน</div>;
  const l = a.lease;
  return (
    <div className="card space-y-3 text-sm self-start">
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">{a.code} <span className="text-sm font-normal text-muted">{a.size}</span></div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLASS[a.state]}`}>{STATE_LABEL[a.state]}</span>
      </div>
      <div className="text-muted">ขนาด {dimText(a.w, a.h)} · {areaText(a.w, a.h)}</div>
      <div className="text-brand-ink font-semibold">{a.price > 0 ? <>{baht(a.price)} <span className="text-muted font-normal">/ {PERIOD[a.period]}</span></> : <span className="text-muted font-normal">ยังไม่ตั้งราคา</span>}</div>
      {a.note && <p className="text-muted">{a.note}</p>}
      <Photos shopId={shopId} assetId={a.id} photos={a.photos} editable={editable} />

      {l ? (
        <div className="space-y-2 border-t border-line pt-3">
          <div><span className="text-muted">ผู้เช่า:</span> {l.tenant} {l.phone && <span className="text-muted">({l.phone})</span>}</div>
          <div><span className="text-muted">สัญญา:</span> {fmtDate(l.start)} – {fmtDate(l.end)}</div>
          <div><span className="text-muted">รอบชำระ:</span> {BILLING[l.billing as keyof typeof BILLING]}</div>
          <div className="space-y-1">
            {l.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-panel2 px-2.5 py-1.5 text-xs">
                <span>{fmtDate(p.due)} · {baht(p.amount)}</span>
                {p.paid ? <span className="text-ok">ชำระแล้ว</span> : editable ? (
                  <form action={markPaid.bind(null, p.id)}><button className={`font-semibold ${p.due < Date.now() ? "text-danger" : "text-brand-ink"}`}>ยืนยันรับเงิน</button></form>
                ) : <span className="text-muted">รอชำระ</span>}
              </div>
            ))}
          </div>
        </div>
      ) : a.endDate ? (
        <div className="border-t border-line pt-3 text-muted">มีผู้เช่า · สัญญาถึง {fmtDate(a.endDate)}</div>
      ) : null}

      {canRent && a.price > 0 && (
        <details className="border-t border-line pt-3"><summary className="btn list-none w-full">ขอเช่า{unit}นี้</summary><RentForm assetId={a.id} period={a.period} /></details>
      )}

      {editable && edit && (
        <form action={act} className="space-y-2 border-t border-line pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">รหัส/ชื่อ</span><input name="code" defaultValue={a.code} required className="input" /></label>
            <label><span className="label">ป้ายขนาด (เช่น S, รถเก๋ง)</span><input name="size" defaultValue={a.size ?? ""} className="input" /></label>
            {/* key ตามขนาดกล่อง: ลากปรับขนาดในผังแล้วช่องนี้อัปเดตตาม */}
            <label key={`w${a.w}`}><span className="label">กว้าง (เมตร)</span><input name="wm" type="number" min={1} step={0.5} defaultValue={toM(a.w)} required className="input" /></label>
            <label key={`h${a.h}`}><span className="label">ยาว (เมตร)</span><input name="hm" type="number" min={1} step={0.5} defaultValue={toM(a.h)} required className="input" /></label>
            <label><span className="label">ราคา (บาท)</span><input name="price" type="number" min={0} defaultValue={a.price} className="input" /></label>
            <label><span className="label">ต่อ</span><select name="period" defaultValue={a.period} className="input"><option value="MONTH">เดือน</option><option value="DAY">วัน</option></select></label>
          </div>
          <label><span className="label">หมายเหตุ</span><input name="note" defaultValue={a.note ?? ""} className="input" /></label>
          {st?.error && <p className="text-danger text-xs">{st.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={pending}>บันทึก</button>
            <button type="button" className="btn-ghost" onClick={() => onShape(a)}>{a.shape === "RECT" ? "เปลี่ยนเป็นวงกลม" : "เปลี่ยนเป็นสี่เหลี่ยม"}</button>
            <button type="button" className="btn-ghost" onClick={() => onDup(a.id)}>ทำซ้ำ</button>
          </div>
          <RotateRow rot={a.rot} onRotate={(d, abs) => onRotate(a.id, d, abs)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost !text-danger" onClick={() => onRemove(a.id)}>ลบ</button>
          </div>
        </form>
      )}
    </div>
  );
}

function FeaturePanel({ shopId, f, onColor, onRotate, onDup, onRemove }: {
  shopId: string; f: FPFeature; onColor: (c: string | null) => void; onRotate: (deg: number, absolute?: boolean) => void; onDup: () => void; onRemove: () => void;
}) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(f.label ?? "");
  const [kind, setKind] = useState<FeatureKind>(f.kind);
  const save = () => start(async () => { await saveFeature(shopId, f.id, { x: f.x, y: f.y, w: f.w, h: f.h, rot: f.rot, label, kind }); });
  return (
    <div className="card space-y-3 text-sm self-start">
      <div className="text-lg font-bold">{FEATURES[f.kind].label}</div>
      <div className="text-xs text-muted">ขนาด {dimText(f.w, f.h)} · ไม่ได้เปิดให้เช่า</div>
      <label className="block"><span className="label">ชนิด</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as FeatureKind)} className="input">
          {(Object.keys(FEATURES) as FeatureKind[]).map((k) => <option key={k} value={k}>{FEATURES[k].label}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">ข้อความที่แสดง {f.kind !== "TEXT" && "(เว้นว่างเพื่อใช้ชื่อชนิด)"}</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={FEATURES[kind].label} className="input" />
      </label>
      <ColorPicker value={f.color} onChange={onColor} />
      <RotateRow rot={f.rot} onRotate={onRotate} />
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending} onClick={save}>บันทึก</button>
        <button className="btn-ghost" onClick={onDup}>ทำซ้ำ</button>
        <button className="btn-ghost !text-danger" onClick={onRemove}>ลบ</button>
      </div>
    </div>
  );
}

/** จานสี + เลือกสีเอง + กลับเป็นสีตั้งต้น (เปลี่ยนแล้วบันทึกทันที) */
function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  // ตัวเลือกสีเองยิง event ถี่ระหว่างลาก → รอให้หยุดก่อนค่อยบันทึก
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pick = (c: string) => { clearTimeout(timer.current); timer.current = setTimeout(() => onChange(c), 250); };
  return (
    <div>
      <span className="label">สี</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            className={`size-7 rounded-full border border-black/10 cursor-pointer transition-transform hover:scale-110 ${value === c ? "ring-2 ring-offset-2 ring-ink" : ""}`}
            style={{ background: c }}
          />
        ))}
        <label title="เลือกสีเอง" className={`relative size-7 rounded-full border border-line cursor-pointer overflow-hidden grid place-items-center text-xs ${value && !PALETTE.includes(value) ? "ring-2 ring-offset-2 ring-ink" : ""}`}
          style={{ background: value && !PALETTE.includes(value) ? value : "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
          <input type="color" value={value ?? "#ffc700"} onChange={(e) => pick(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <button type="button" onClick={() => onChange(null)} className={`btn-ghost !py-1 !px-2 text-xs ${value === null ? "pill-on" : ""}`}>ค่าเริ่มต้น</button>
      </div>
    </div>
  );
}

/** ปุ่มหมุน ±90° และช่องกรอกองศา (บันทึกเมื่อกด Enter หรือออกจากช่อง) */
function RotateRow({ rot, onRotate }: { rot: number; onRotate: (deg: number, absolute?: boolean) => void }) {
  const commit = (el: HTMLInputElement) => { const v = Number(el.value); if (Number.isFinite(v) && norm(v) !== rot) onRotate(v, true); };
  return (
    <div className="flex items-center gap-2">
      <span className="label !mb-0">หมุน</span>
      <button type="button" className="btn-ghost !py-1" onClick={() => onRotate(-90)}>⟲ 90°</button>
      <button type="button" className="btn-ghost !py-1" onClick={() => onRotate(90)}>⟳ 90°</button>
      <input
        key={rot}
        type="number"
        defaultValue={rot}
        step={15}
        className="input !w-20 !py-1"
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(e.currentTarget); } }}
      />
      <span className="text-muted">°</span>
    </div>
  );
}

function FloorPanel({ shopId, floor, canDelete, onDeleted }: { shopId: string; floor: FPFloor; canDelete: boolean; onDeleted: () => void }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState({ name: floor.name, w: toM(floor.w), h: toM(floor.h) });
  const [msg, setMsg] = useState<string | null>(null);
  const SIZES = [[50, 30, "เล็ก"], [80, 50, "กลาง"], [120, 75, "ใหญ่"]] as const;
  return (
    <div className="card space-y-3 text-sm self-start">
      <div className="text-lg font-bold">ตั้งค่าชั้น/โซน</div>
      <p className="text-xs text-muted">แตะห้องหรือองค์ประกอบในผังเพื่อแก้ไข · ใช้ “องค์ประกอบผัง” เพิ่มผนัง ทางเดิน ทางเข้า บันได ห้องน้ำ ฯลฯ</p>
      <label className="block"><span className="label">ชื่อ</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="input" /></label>
      <div>
        <span className="label">ขนาดพื้นที่ (กว้าง × ยาว เมตร)</span>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={v.w} min={15} max={toM(CANVAS.maxW)} step={1} onChange={(e) => setV({ ...v, w: +e.target.value })} className="input" />
          <input type="number" value={v.h} min={10} max={toM(CANVAS.maxH)} step={1} onChange={(e) => setV({ ...v, h: +e.target.value })} className="input" />
        </div>
        <div className="flex gap-2 mt-2">
          {SIZES.map(([w, h, t]) => <button key={t} type="button" className="btn-ghost !py-1 text-xs" onClick={() => setV({ ...v, w, h })}>{t} {w}×{h} ม.</button>)}
        </div>
      </div>
      {msg && <p className="text-xs text-danger">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending} onClick={() => start(async () => { const r = await updateFloor(shopId, floor.id, { name: v.name, w: toPx(v.w), h: toPx(v.h) }); setMsg(r?.error ?? null); })}>บันทึก</button>
        {canDelete && (
          <button className="btn-ghost !text-danger" disabled={pending} onClick={() => {
            if (!confirm(`ลบ ${floor.name}? องค์ประกอบผังในชั้นนี้จะถูกลบด้วย`)) return;
            start(async () => { const r = await deleteFloor(shopId, floor.id); if (r?.error) setMsg(r.error); else onDeleted(); });
          }}>ลบชั้นนี้</button>
        )}
      </div>
    </div>
  );
}

function N({ name, label, v, min = 0, step = 1 }: { name: string; label: string; v: number; min?: number; step?: number }) {
  return <label><span className="label">{label}</span><input name={name} type="number" min={min} step={step} defaultValue={v} className="input" /></label>;
}

function GenPanel({ shopId, floorId, category, unit, onDone }: { shopId: string; floorId: string; category: Category; unit: string; onDone: (ids?: string[]) => void }) {
  const [st, act, pending] = useActionState(generateLayout.bind(null, shopId, floorId), undefined);
  const p = LAYOUT_PRESET[category];
  const done = useRef(false);
  useEffect(() => { if (st && !st.error && !done.current) { done.current = true; onDone(st.ids); } }, [st, onDone]);
  return (
    <form action={act} className="card space-y-3 text-sm self-start">
      <div className="text-lg font-bold">⚡ สร้างผังอัตโนมัติ</div>
      <p className="text-xs text-muted">วาง{unit}เป็นแถว ๆ พร้อมทางเดินคั่น ต่อจากของเดิมด้านล่าง (ขยายพื้นที่ให้อัตโนมัติ)</p>
      <div className="grid grid-cols-2 gap-2">
        <N name="rows" label="จำนวนแถว" v={p.rows} min={1} />
        <N name="cols" label={`${unit}ต่อแถว`} v={p.cols} min={1} />
        <N name="w" label="กว้าง (ม.)" v={toM(p.w)} min={1} step={0.5} />
        <N name="h" label="ยาว (ม.)" v={toM(p.h)} min={1} step={0.5} />
        <N name="gap" label="ระยะห่าง (ม.)" v={toM(p.gap)} step={0.5} />
        <label><span className="label">ทางเดินทุก ๆ</span>
          <select name="aisleEvery" defaultValue={p.aisleEvery} className="input">
            <option value={0}>ไม่มีทางเดิน</option>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} แถว</option>)}
          </select>
        </label>
        <N name="aisle" label="ทางเดินกว้าง (ม.)" v={toM(p.aisle || 60)} min={1} step={0.5} />
        <label><span className="label">คำนำหน้ารหัส</span><input name="prefix" defaultValue={p.prefix} maxLength={5} className="input" /></label>
        <N name="price" label="ราคา (บาท)" v={0} />
        <label><span className="label">ต่อ</span><select name="period" defaultValue="MONTH" className="input"><option value="MONTH">เดือน</option><option value="DAY">วัน</option></select></label>
      </div>
      <label className="block"><span className="label">ป้ายขนาด (ไม่บังคับ)</span><input name="size" className="input" /></label>
      {st?.error && <p className="text-danger text-xs">{st.error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={pending}>{pending ? "กำลังสร้าง…" : "สร้างผัง"}</button>
        <button type="button" className="btn-ghost" onClick={() => onDone()}>ยกเลิก</button>
      </div>
    </form>
  );
}
