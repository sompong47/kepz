"use client";
import { useActionState, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  addShape, saveLayout, updateAsset, duplicateAsset, markPaid, pasteItems,
  addFeature, saveFeature, setFeatureColor, duplicateFeature, deleteItems, addFloor, updateFloor, deleteFloor, generateLayout, applyTemplate,
} from "@/lib/actions";
import {
  BILLING, CATEGORIES, CANVAS, FEATURES, FLOOR_TEMPLATES, LAYOUT_PRESET, MIN_ASSET_PX, areaText, dimText, toM, toPx, PERIOD, STATE_CLASS, STATE_LABEL, baht, fmtDate,
  type AssetState, type Category, type FeatureKind,
} from "@/lib/domain";
import type { FPAsset, FPFeature, FPFloor } from "@/lib/floor";
import { RentForm, WalkInForm } from "./Forms";
import { BulkListing } from "./Listing";
import Photos from "./Photos";

type Mode = "move" | "rot" | "nw" | "ne" | "sw" | "se";
type Rect = { x: number; y: number; w: number; h: number };
type Box = Rect & { rot: number };

/** สแนปช็อตของห้อง/องค์ประกอบ ใช้ทั้งคัดลอก-วาง และเลิกทำ */
type Snap = Box & { id: string; floorId: string } & (
  | { t: "A"; code: string; size: string | null; price: number; period: "DAY" | "MONTH"; note: string | null; shape: "RECT" | "CIRCLE"; listed?: boolean; photos?: { file: string }[] }
  | { t: "F"; kind: FeatureKind; label: string | null; color?: string | null }
);
/** ประวัติสำหรับ Ctrl+Z / Ctrl+Y; id ในประวัติอาจถูกแทนด้วย id ใหม่หลังกู้คืน (ดู alias) */
type Op =
  | { t: "layout"; before: [string, Box][]; after: [string, Box][] }
  | { t: "create"; ids: string[]; snaps?: Snap[] }
  | { t: "delete"; snaps: Snap[] }
  | { t: "color"; before: [string, string | null][]; after: [string, string | null][] };
const HISTORY_MAX = 50;
const ZOOM_MIN = 0.5, ZOOM_MAX = 8;

type ToolTab = "units" | "elements" | "templates" | "floor";
const GLYPH: Record<FeatureKind, string> = {
  ZONE: "⬚", ROAD: "═", WATER: "🌊", GREEN: "🌿", WALL: "▬", ENTRANCE: "⇆", OFFICE: "🏢", TOILET: "🚻", STAIRS: "☰", TEXT: "T",
};

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
const FILL: Record<AssetState, string> = { VACANT: "#ffffff", OCCUPIED: "#ffc700", EXPIRING: "#fb923c", PENDING: "#38bdf8" };
const BORDER_COLOR: Record<AssetState, string> = { VACANT: "#16a34a", OCCUPIED: "#b45309", EXPIRING: "#ea580c", PENDING: "#0284c7" };

/** สีให้เลือกสำหรับองค์ประกอบผัง */
const PALETTE = ["#ffc700", "#f97316", "#dc2626", "#db2777", "#9333ea", "#2563eb", "#0284c7", "#0d9488", "#16a34a", "#a16207", "#757575", "#111111"];
const alpha = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
/** สีตัวอักษรบนพื้นสีนั้น ๆ (ดำหรือขาว ตามความสว่าง) */
const inkOn = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
};

/** หน้าตาขององค์ประกอบผังแต่ละชนิด (ถ้าตั้งสีเองจะใช้สีนั้นแทนสีตั้งต้น) */
function featureLook(f: FPFeature): { style: React.CSSProperties; text: string | null; badge?: boolean } {
  const name = f.label ?? FEATURES[f.kind]?.label ?? f.kind;
  const horiz = f.w >= f.h;
  const c = f.color;
  if (c) {
    switch (f.kind) {
      case "ZONE":
        return { style: { border: `2px dashed ${c}`, backgroundColor: alpha(c, 0.08), borderRadius: 14, alignItems: "flex-start", justifyContent: "flex-start", padding: 8, color: "#111", fontSize: 12, fontWeight: 600 }, text: name, badge: true };
      case "ROAD":
        return {
          style: {
            backgroundColor: c, color: inkOn(c), fontSize: 12, borderRadius: 6,
            backgroundImage: `repeating-linear-gradient(${horiz ? "90deg" : "180deg"}, rgba(255,255,255,.8) 0 14px, transparent 14px 28px)`,
            backgroundSize: horiz ? "100% 2px" : "2px 100%", backgroundPosition: "center", backgroundRepeat: "no-repeat",
          },
          text: f.label,
        };
      case "WALL":
        return { style: { backgroundColor: c, borderRadius: 3 }, text: null };
      case "STAIRS":
        return { style: { backgroundImage: `repeating-linear-gradient(0deg,${alpha(c, 0.15)} 0 8px,${alpha(c, 0.6)} 8px 10px)`, border: `1.5px solid ${c}`, borderRadius: 8, color: "#111", fontSize: 12, fontWeight: 600 }, text: `☰ ${name}` };
      case "TEXT":
        return { style: { color: c, fontWeight: 700, fontSize: Math.max(11, Math.min(48, f.h * 0.6)), whiteSpace: "nowrap" }, text: name };
      default:
        return { style: { backgroundColor: alpha(c, 0.18), border: `2px solid ${c}`, borderRadius: 10, color: "#111", fontSize: 12, fontWeight: 600 }, text: `${GLYPH[f.kind] ?? ""} ${name}`.trim() };
    }
  }
  switch (f.kind) {
    case "ZONE":
      return { style: { border: "2px dashed #9ca3af", backgroundColor: "rgba(255,199,0,.06)", borderRadius: 14, alignItems: "flex-start", justifyContent: "flex-start", padding: 8, color: "#333", fontSize: 12, fontWeight: 600 }, text: name, badge: true };
    case "ROAD":
      return {
        style: {
          backgroundColor: "#dcdad2", color: "#444", fontSize: 12, borderRadius: 6,
          backgroundImage: `repeating-linear-gradient(${horiz ? "90deg" : "180deg"}, #ffffff 0 14px, transparent 14px 28px)`,
          backgroundSize: horiz ? "100% 2px" : "2px 100%", backgroundPosition: "center", backgroundRepeat: "no-repeat",
        },
        text: f.label,
      };
    case "WATER":
      return {
        style: {
          backgroundColor: "#e0f2fe", border: "2px solid #7dd3fc", borderRadius: 14, color: "#0369a1", fontSize: 13, fontWeight: 600,
          backgroundImage: "radial-gradient(circle at 20px 20px, rgba(56,189,248,0.22) 2px, transparent 0)",
          backgroundSize: "32px 32px", alignItems: "flex-end", justifyContent: "flex-end", padding: 10,
        },
        text: `🌊 ${name}`,
      };
    case "GREEN":
      return {
        style: {
          backgroundColor: "#dcfce7", border: "2px dashed #4ade80", borderRadius: 12, color: "#15803d", fontSize: 12, fontWeight: 600,
        },
        text: `🌿 ${name}`,
      };
    case "WALL":
      return { style: { backgroundColor: "#333333", borderRadius: 3 }, text: null };
    case "ENTRANCE":
      return { style: { backgroundColor: "#dcfce7", border: "2px solid #16a34a", borderRadius: 10, color: "#166534", fontSize: 12, fontWeight: 600 }, text: `⇆ ${name}` };
    case "STAIRS":
      return { style: { backgroundImage: "repeating-linear-gradient(0deg,#f1f1f1 0 8px,#c8c8c8 8px 10px)", border: "1.5px solid #9ca3af", borderRadius: 8, color: "#333", fontSize: 12, fontWeight: 600 }, text: `☰ ${name}` };
    case "TOILET":
      return { style: { backgroundColor: "#e0f2fe", border: "2px solid #0284c7", borderRadius: 10, color: "#075985", fontSize: 12, fontWeight: 600 }, text: `🚻 ${name}` };
    case "OFFICE":
      return { style: { backgroundColor: "#fef9c3", border: "2px solid #ca8a04", borderRadius: 10, color: "#713f12", fontSize: 12, fontWeight: 600 }, text: `🏢 ${name}` };
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
  // ถ้าร้านยังไม่มีอะไรเลยในผัง และเป็นเจ้าของร้าน ให้เปิดโหมดแก้ไขพร้อมคำแนะนำทันที
  const [edit, setEdit] = useState(() => !!editable && assets.length === 0 && features.length === 0);
  const [toolTab, setToolTab] = useState<ToolTab>("units");
  const [lockBg, setLockBg] = useState(false);
  const [gen, setGen] = useState(false);
  const [saving, setSaving] = useState<"" | "saving" | "saved">("");

  // ตัวกรองฝั่งผู้เช่า/ผู้ชมผัง (ช่วยให้หาห้องว่างง่ายขึ้น)
  const [onlyVacant, setOnlyVacant] = useState(false);
  const [sizeFilter, setSizeFilter] = useState<string>("");
  const [searchCode, setSearchCode] = useState("");

  // fit = ย่อให้พอดีความกว้างกล่อง; zoom = ซูมเพิ่มจากจุดนั้น (1 = พอดี)
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);
  const scale = fit * zoom;
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const spaceDown = useRef(false);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; sx: number; sy: number; group: { id: string; isAsset: boolean; o: Box }[]; last: Map<string, Box> | null } | null>(null);
  const marq = useRef<{ x0: number; y0: number; add: boolean } | null>(null);
  const [pendingTpl, start] = useTransition();

  const floor = floors.find((f) => f.id === floorId) ?? floors[0];
  const W = floor?.w ?? CANVAS.w, H = floor?.h ?? CANVAS.h;

  useEffect(() => setItems(assets), [assets]);
  useEffect(() => setFeats(features), [features]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(1, el.clientWidth / W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);

  /** ซูมโดยตรึงจุดใต้เมาส์ (หรือกึ่งกลางกล่อง) ไว้กับที่ */
  const zoomTo = (z: number, clientX?: number, clientY?: number) => {
    const el = wrap.current;
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    if (!el || nz === zoom) return;
    const r = el.getBoundingClientRect();
    const px = (clientX ?? r.left + el.clientWidth / 2) - r.left, py = (clientY ?? r.top + el.clientHeight / 2) - r.top;
    const cx = (el.scrollLeft + px) / scale, cy = (el.scrollTop + py) / scale;
    pendingScroll.current = { left: cx * fit * nz - px, top: cy * fit * nz - py };
    setZoom(nz);
  };
  useLayoutEffect(() => {
    const el = wrap.current, s = pendingScroll.current;
    if (el && s) { el.scrollLeft = s.left; el.scrollTop = s.top; pendingScroll.current = null; }
  }, [zoom]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  useEffect(() => {
    const typing = (e: KeyboardEvent) => ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName);
    const onDown = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Space") { e.preventDefault(); spaceDown.current = true; setPanning(true); }
      else if (e.code === "Equal" || e.code === "NumpadAdd") zoomTo(zoom * 1.25);
      else if (e.code === "Minus" || e.code === "NumpadSubtract") zoomTo(zoom / 1.25);
      else if (e.code === "Digit0" || e.code === "Numpad0") zoomTo(1);
    };
    const onUp = (e: KeyboardEvent) => { if (e.code === "Space") { spaceDown.current = false; setPanning(false); } };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  });

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

  /** จัดเรียงหลายชิ้นให้ตรงแนวเดียวกัน (เหมือน Align / Distribute ใน Canva) */
  const alignSelected = (kind: "left" | "centerX" | "right" | "top" | "centerY" | "bottom" | "distH" | "distV") => {
    const g = groupOf(selIds);
    if (g.length < 2) return;
    const minX = Math.min(...g.map((x) => x.o.x));
    const maxR = Math.max(...g.map((x) => x.o.x + x.o.w));
    const minY = Math.min(...g.map((x) => x.o.y));
    const maxB = Math.max(...g.map((x) => x.o.y + x.o.h));
    const m = new Map<string, Box>();

    if (kind === "distH" && g.length >= 3) {
      const sorted = [...g].sort((a, b) => a.o.x - b.o.x);
      const totalW = sorted.reduce((s, x) => s + x.o.w, 0);
      const gap = (maxR - minX - totalW) / (sorted.length - 1);
      let curX = minX;
      sorted.forEach((item) => {
        m.set(item.id, clampIn({ ...item.o, x: snap(curX) }));
        curX += item.o.w + gap;
      });
    } else if (kind === "distV" && g.length >= 3) {
      const sorted = [...g].sort((a, b) => a.o.y - b.o.y);
      const totalH = sorted.reduce((s, x) => s + x.o.h, 0);
      const gap = (maxB - minY - totalH) / (sorted.length - 1);
      let curY = minY;
      sorted.forEach((item) => {
        m.set(item.id, clampIn({ ...item.o, y: snap(curY) }));
        curY += item.o.h + gap;
      });
    } else {
      for (const item of g) {
        let { x, y } = item.o;
        if (kind === "left") x = minX;
        if (kind === "centerX") x = snap((minX + maxR) / 2 - item.o.w / 2);
        if (kind === "right") x = maxR - item.o.w;
        if (kind === "top") y = minY;
        if (kind === "centerY") y = snap((minY + maxB) / 2 - item.o.h / 2);
        if (kind === "bottom") y = maxB - item.o.h;
        m.set(item.id, clampIn({ ...item.o, x, y }));
      }
    }
    if (m.size) commitLayout(g, m);
  };

  const down = (e: React.PointerEvent, id: string, b: Box, mode: Mode) => {
    if (e.button !== 0 || spaceDown.current) return;
    e.stopPropagation();
    setGen(false);
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

  const bgDown = (e: React.PointerEvent) => {
    if (e.button === 1 || spaceDown.current || (!edit && e.button === 0)) {
      e.preventDefault();
      if (!edit) setSel(null);
      const el = wrap.current!;
      pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      e.currentTarget.setPointerCapture(e.pointerId);
      setPanning(true);
      return;
    }
    if (e.button !== 0) return setSel(null);
    const p = toCanvas(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    marq.current = { x0: p.x, y0: p.y, add };
    if (!add) setSelIds([]);
    setGen(false);
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const move = (e: React.PointerEvent) => {
    if (pan.current) {
      const el = wrap.current!;
      el.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
      el.scrollTop = pan.current.top - (e.clientY - pan.current.y);
      return;
    }
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
      const g = d.group[0], p = toCanvas(e);
      const deg = Math.atan2(p.y - (g.o.y + g.o.h / 2), p.x - (g.o.x + g.o.w / 2)) / RAD + 90;
      d.last = new Map([[g.id, clampIn({ ...g.o, rot: norm(e.shiftKey ? deg : Math.round(deg / 15) * 15) })]]);
    } else {
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
    if (pan.current) {
      pan.current = null;
      if (!spaceDown.current) setPanning(false);
      return;
    }
    if (marq.current) {
      const add = marq.current.add;
      marq.current = null;
      const r = marquee;
      setMarquee(null);
      if (!r || (r.w < 4 && r.h < 4)) return;
      const hit = (o: Box) => { const b = aabb(o); return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y; };
      const inside = (o: Box) => { const b = aabb(o); return b.x >= r.x && b.x + b.w <= r.x + r.w && b.y >= r.y && b.y + b.h <= r.y + r.h; };
      // ลากคลุมเลือกทั้งห้องและองค์ประกอบ (โซนพื้นหลังต้องคลุมทั้งกรอบถึงจะติดมาด้วย เพื่อไม่ให้กวนการเลือกห้อง)
      const hitUnits = onFloor.filter(hit).map((b) => b.id);
      const hitFeats = fOnFloor
        .filter((f) => !(lockBg && FEATURES[f.kind]?.back))
        .filter((f) => (FEATURES[f.kind]?.back ? inside(f) : hit(f)))
        .map((f) => f.id);
      const ids = [...hitUnits, ...hitFeats];
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
    if (a) return { t: "A", id, floorId: a.floorId, x: a.x, y: a.y, w: a.w, h: a.h, rot: a.rot, code: a.code, size: a.size, price: a.price, period: a.period, note: a.note, shape: a.shape, listed: a.listed };
    const f = feats.find((x) => x.id === id);
    return f ? { t: "F", id, floorId: f.floorId, x: f.x, y: f.y, w: f.w, h: f.h, rot: f.rot, kind: f.kind, label: f.label, color: f.color } : null;
  };
  const removeIds = async (ids: string[]) => {
    const snaps = ids.map(snapOf).filter((s): s is Snap => !!s);
    if (!snaps.length) return [];
    const r = await deleteItems(shopId, snaps.map((s) => s.id));
    if (r.skipped.length) alert(`ข้าม ${r.skipped.length} รายการที่มีสัญญาหรือคำขอเช่าค้างอยู่: ${r.skipped.join(", ")}`);
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
  const setColor = (ids: string[], color: string | null) => {
    const fs = feats.filter((f) => ids.includes(f.id));
    if (!fs.length) return;
    applyColors(fs.map((f) => [f.id, color]));
    record({ t: "color", before: fs.map((f) => [f.id, f.color]), after: fs.map((f) => [f.id, color]) });
  };
  const [note, setNote] = useState("");
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = (msg: string) => { setNote(msg); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(""), 2800); };
  const copySelected = () => {
    clipboard = selIds.map(snapOf).filter((s): s is Snap => !!s);
    flash(`คัดลอก ${clipboard.length} รายการแล้ว — กด Ctrl+V เพื่อวาง`);
    pasteCount = 0;
    setSaving("");
  };
  const paste = () => {
    if (!clipboard.length) return flash("ยังไม่ได้คัดลอกอะไร — เลือกแล้วกด Ctrl+C ก่อน");
    if (!floor || busy.current) return;
    const off = clipboard.every((s) => s.floorId === floor.id) ? ++pasteCount * 20 : 0;
    const snaps = clipboard.map((s) => ({ ...s, floorId: floor.id, x: s.x + off, y: s.y + off }));
    busy.current = true;
    start(async () => {
      try {
        const ids = (await pasteItems(shopId, snaps, false)).filter((i): i is string => !!i);
        if (ids.length) { record({ t: "create", ids }); setSelIds(ids); flash(`วาง ${ids.length} รายการแล้ว`); }
      } finally { busy.current = false; }
    });
  };

  useEffect(() => {
    if (!edit) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const ctrl = e.ctrlKey || e.metaKey, k = e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      if (ctrl && k === "a") {
        e.preventDefault();
        return setSelIds(onFloor.map((b) => b.id));
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
  const useTemplate = (tplId: string) => {
    if (!floor || busy.current) return;
    start(async () => {
      const r = await applyTemplate(shopId, floor.id, tplId);
      if (r.ids?.length) {
        record({ t: "create", ids: r.ids });
        setEdit(true);
        setToolTab("units");
        flash(`✨ สร้างผังจากแม่แบบเรียบร้อย (${r.ids.length} รายการ) — ลากปรับแต่งต่อได้เลย`);
      }
    });
  };
  const toggleShape = (a: FPAsset) => {
    const shape = a.shape === "RECT" ? "CIRCLE" : "RECT";
    setItems((l) => l.map((x) => (x.id === a.id ? { ...x, shape } : x)));
    setSaving("saving");
    saveLayout(shopId, a.id, { ...a, shape }).then(() => setSaving("saved"));
  };
  const switchFloor = (id: string) => { setFloorId(id); setSel(null); setGen(false); setZoom(1); };

  const onFloor = items.filter((a) => a.floorId === floor?.id);
  const fOnFloor = feats.filter((f) => f.floorId === floor?.id);
  const back = fOnFloor.filter((f) => FEATURES[f.kind]?.back);
  const front = fOnFloor.filter((f) => !FEATURES[f.kind]?.back);
  const curAsset = items.find((a) => a.id === sel) ?? null;
  const curFeat = feats.find((f) => f.id === sel) ?? null;

  // ขนาดที่มีทั้งหมดบนชั้นนี้ (สำหรับปุ่มกรองฝั่งผู้เช่า)
  const distinctSizes = [...new Set(onFloor.map((a) => a.size).filter((s): s is string => !!s))];
  const isFilteredOut = (a: FPAsset) => {
    if (!editable && !a.listed) return true;
    if (onlyVacant && a.state !== "VACANT") return true;
    if (sizeFilter && a.size !== sizeFilter) return true;
    if (searchCode && !a.code.toLowerCase().includes(searchCode.trim().toLowerCase()) && !(a.size ?? "").toLowerCase().includes(searchCode.trim().toLowerCase())) return true;
    return false;
  };

  const handles = (id: string, b: Box) =>
    edit && sel === id && (
      <>
        {(["nw", "ne", "sw", "se"] as const).map((m) => (
          <span
            key={m}
            onPointerDown={(e) => down(e, id, b, m)}
            className="absolute size-3.5 rounded-sm bg-white border-2 border-black z-20"
            style={{ [m.includes("n") ? "top" : "bottom"]: -7, [m.includes("w") ? "left" : "right"]: -7, cursor: m === "nw" || m === "se" ? "nwse-resize" : "nesw-resize" }}
          />
        ))}
        <span className="absolute left-1/2 -top-6 h-6 w-0.5 -translate-x-1/2 bg-ink/60 pointer-events-none" />
        <span
          title="ลากเพื่อหมุน (Shift = อิสระ)"
          onPointerDown={(e) => down(e, id, b, "rot")}
          className="absolute left-1/2 -top-9 size-4 -translate-x-1/2 rounded-full bg-brand border-2 border-black z-20 cursor-grab active:cursor-grabbing"
        />
        {drag.current?.mode === "rot" && <span className="absolute left-1/2 -top-16 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white whitespace-nowrap" style={{ transform: `translateX(-50%) rotate(${-b.rot}deg)` }}>{b.rot}°</span>}
      </>
    );

  const renderFeature = (f: FPFeature) => {
    const { style, text, badge } = featureLook(f);
    const locked = edit && lockBg && FEATURES[f.kind]?.back;
    return (
      <div
        key={f.id}
        onPointerDown={(e) => down(e, f.id, f, "move")}
        className={`absolute flex items-center justify-center text-center leading-tight overflow-visible ${edit && !locked ? "cursor-move" : ""}`}
        style={{
          left: f.x, top: f.y, width: f.w, height: f.h,
          transform: f.rot ? `rotate(${f.rot}deg)` : undefined,
          pointerEvents: edit && !locked ? "auto" : "none",
          outline: selIds.includes(f.id) ? "3px solid #111" : "none",
          outlineOffset: 2,
          ...style,
        }}
      >
        {text && (
          <span
            className={`pointer-events-none ${badge ? "rounded-md bg-white/90 px-2 py-0.5 shadow-xs border border-black/10" : ""}`}
            style={{ transform: upright(f.rot) }}
          >
            {text}
          </span>
        )}
        {handles(f.id, f)}
      </div>
    );
  };

  const catTemplates = FLOOR_TEMPLATES.filter((t) => t.category === category);
  const otherTemplates = FLOOR_TEMPLATES.filter((t) => t.category !== category);

  return (
    <div className="space-y-3">
      {/* แถบเลือกชั้น + ปุ่มสลับโหมดแก้ไข */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(floors.length > 1 || (editable && edit)) && (
            <>
              {floors.map((f) => (
                <button key={f.id} onClick={() => switchFloor(f.id)} className={`btn-ghost !py-1.5 ${f.id === floor?.id ? "pill-on" : ""}`}>
                  🏢 {f.name}
                </button>
              ))}
              {editable && edit && (
                <button className="btn-ghost !py-1.5 text-muted" onClick={() => start(async () => switchFloor(await addFloor(shopId)))}>
                  + เพิ่มชั้น/โซน
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              {!edit ? (
                <button className="btn" onClick={() => setEdit(true)}>🎨 แก้ไข / ตกแต่งผังร้าน</button>
              ) : (
                <>
                  <button className="btn-ghost !py-1.5" title="เลิกทำ (Ctrl+Z)" disabled={!undoStack.current.length} onClick={() => historyStep("undo")}>↶ เลิกทำ</button>
                  <button className="btn-ghost !py-1.5" title="ทำซ้ำ (Ctrl+Y)" disabled={!redoStack.current.length} onClick={() => historyStep("redo")}>↷ ทำซ้ำ</button>
                  <button className="btn-dark !py-2" onClick={() => { setEdit(false); setSelIds([]); setGen(false); }}>✓ เสร็จสิ้นการแต่งผัง</button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* โหมดดูผัง (สำหรับคนเช่า & เจ้าของร้านเวลาดูภาพรวม): แถบค้นหาและตัวกรองที่เข้าใจง่าย */}
      {!edit && onFloor.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-panel px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-xl bg-panel2 px-3 py-1.5 text-xs font-medium cursor-pointer select-none">
              <input type="checkbox" checked={onlyVacant} onChange={(e) => setOnlyVacant(e.target.checked)} className="size-4 accent-[#16a34a]" />
              <span>แสดงเฉพาะ{unit}ว่างพร้อมเช่า ({onFloor.filter((a) => a.listed && a.state === "VACANT").length})</span>
            </label>
            {distinctSizes.length > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                <button onClick={() => setSizeFilter("")} className={`rounded-lg px-2.5 py-1 text-xs cursor-pointer ${!sizeFilter ? "bg-ink text-white font-medium" : "bg-panel2 text-ink2 hover:bg-line"}`}>
                  ทุกขนาด
                </button>
                {distinctSizes.map((sz) => (
                  <button key={sz} onClick={() => setSizeFilter(sizeFilter === sz ? "" : sz)} className={`rounded-lg px-2.5 py-1 text-xs cursor-pointer ${sizeFilter === sz ? "bg-ink text-white font-medium" : "bg-panel2 text-ink2 hover:bg-line"}`}>
                    {sz}
                  </button>
                ))}
              </div>
            )}
            <input
              type="search"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              placeholder={`ค้นหารหัส${unit}…`}
              className="input !w-36 !py-1 !px-2.5 !text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-white border-2 border-[#16a34a]" />ว่างพร้อมเช่า</span>
            <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-brand" />มีผู้เช่า</span>
            <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-sky-400" />รออนุมัติ</span>
            {editable && <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full border-2 border-dashed border-[#9e9e9e] bg-[#fafafa]" />ยังไม่เปิดเช่า</span>}
          </div>
        </div>
      )}

      {/* แถบเครื่องมือแบบ Canva เมื่ออยู่ในโหมดแก้ไข */}
      {edit && floor && (
        <div className="rounded-2xl border border-line bg-panel p-3 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
            <div className="flex flex-wrap gap-1.5">
              {([
                ["units", `➕ เพิ่ม${unit}เช่า`],
                ["elements", "🧱 ของตกแต่งผัง (ถนน/โซน/ห้องน้ำ)"],
                ["templates", "✨ แม่แบบผังสำเร็จรูป (1 คลิก)"],
                ["floor", `📐 ขนาดพื้นที่ (${toM(floor.w)}×${toM(floor.h)} ม.)`],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setToolTab(tab); if (tab !== "units") setGen(false); }}
                  className={`rounded-xl px-3 py-1.5 text-xs sm:text-sm font-medium cursor-pointer transition ${
                    toolTab === tab ? "bg-ink text-white shadow-xs" : "bg-panel2 text-ink2 hover:bg-line/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs text-ink2 cursor-pointer select-none px-2 py-1 rounded-lg hover:bg-panel2" title="ล็อกโซนและถนนไม่ให้เผลอลากขยับเวลาจัดเรียงห้อง">
              <input type="checkbox" checked={lockBg} onChange={(e) => setLockBg(e.target.checked)} className="size-3.5 accent-ink" />
              <span>🔒 ล็อกพื้นหลังโซน/ถนน</span>
            </label>
          </div>

          {toolTab === "units" && (
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn !py-1.5 !px-3 text-xs sm:text-sm" onClick={() => run(() => addShape(shopId, floor.id, "RECT"))}>
                ＋ เพิ่ม{unit} (สี่เหลี่ยม)
              </button>
              <button className="btn-ghost !py-1.5 text-xs sm:text-sm" onClick={() => run(() => addShape(shopId, floor.id, "CIRCLE"))}>
                ◯ เพิ่ม{unit} (วงกลม)
              </button>
              <button className={`${gen ? "btn-dark" : "btn-ghost"} !py-1.5 text-xs sm:text-sm`} onClick={() => { setGen(!gen); setSel(null); }}>
                ⚡ สร้าง{unit}เรียงเป็นแถวอัตโนมัติ
              </button>
              <button className="btn-ghost !py-1.5 text-xs sm:text-sm !border-brand bg-brand/10" onClick={() => setToolTab("templates")}>
                ✨ ใช้แม่แบบสำเร็จรูป
              </button>
            </div>
          )}

          {toolTab === "elements" && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(FEATURES) as FeatureKind[]).map((k) => (
                <button
                  key={k}
                  className="btn-ghost !py-1.5 !px-2.5 text-xs"
                  onClick={() => {
                    if (lockBg && FEATURES[k].back) setLockBg(false);
                    run(() => addFeature(shopId, floor.id, k));
                  }}
                >
                  <span className="mr-1">{GLYPH[k]}</span>{FEATURES[k].label}
                </button>
              ))}
            </div>
          )}

          {toolTab === "templates" && (
            <div className="space-y-2.5">
              <div className="text-xs text-muted">
                คลิกเลือกแม่แบบเพื่อวางโครงสร้าง (โซน, ทางเดิน, สำนักงาน, ห้องน้ำ) พร้อม{unit}เช่าและราคาแนะนำลงในผังทันที (กด <b>Ctrl+Z</b> ยกเลิกได้)
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {[...catTemplates, ...otherTemplates].map((t) => {
                  const isMatch = t.category === category;
                  return (
                    <div key={t.id} className={`rounded-xl border p-3 flex flex-col justify-between gap-2 ${isMatch ? "border-brand bg-brand/10" : "border-line bg-panel2/60"}`}>
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-brand-ink">
                            {CATEGORIES[t.category].icon} {CATEGORIES[t.category].label}
                          </span>
                          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-ink">{t.badge}</span>
                        </div>
                        <div className="font-bold text-sm mt-1">{t.name}</div>
                        <p className="text-xs text-muted mt-0.5">{t.desc}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-line/70">
                        <span className="text-[11px] text-ink2 font-medium">{t.assets.length} รายการเช่า + {t.features.length} โซน</span>
                        <button
                          type="button"
                          disabled={pendingTpl}
                          onClick={() => useTemplate(t.id)}
                          className="btn !py-1 !px-3 text-xs"
                        >
                          {pendingTpl ? "กำลังสร้าง…" : "＋ ใช้แม่แบบนี้"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {toolTab === "floor" && (
            <FloorInlineSettings
              key={floor.id}
              shopId={shopId}
              floor={floor}
              canDelete={floors.length > 1}
              onDeleted={() => switchFloor(floors.find((f) => f.id !== floor.id)!.id)}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted pt-1 border-t border-line/60">
            <span>
              💡 คลิกชิ้นใดก็ได้เพื่อย้าย/แก้ราคา · ลากคลุมเพื่อเลือกหลายชิ้น · กด <b>Ctrl+C / Ctrl+V</b> คัดลอก-วาง · <b>Delete</b> ลบ
            </span>
            <span>
              {saving === "saving" ? "⏳ กำลังบันทึกอัตโนมัติ…" : saving === "saved" ? "✓ บันทึกผังเรียบร้อย" : ""}
              {note && <span className="ml-2 rounded-full bg-ink px-2.5 py-0.5 text-white">{note}</span>}
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="relative min-w-0">
          <div ref={wrap} className={`rounded-2xl border border-line overflow-auto bg-[#faf8f2] shadow-inner ${panning ? "cursor-grab active:cursor-grabbing" : ""}`} style={{ height: H * fit }}>
            <div style={{ width: W * scale, height: H * scale }}>
              <div
                ref={canvas}
                onPointerDown={bgDown}
                onPointerMove={move}
                onPointerUp={up}
                className="relative origin-top-left touch-none select-none"
                style={{
                  width: W, height: H, transform: `scale(${scale})`,
                  backgroundImage: edit
                    ? "linear-gradient(#ece8dc 1px,transparent 1px),linear-gradient(90deg,#ece8dc 1px,transparent 1px)"
                    : "radial-gradient(#e5e0d0 1px, transparent 1px)",
                  backgroundSize: `${CANVAS.grid * 2}px ${CANVAS.grid * 2}px`,
                }}
              >
                {back.map(renderFeature)}
                {onFloor.map((a) => {
                  const dimmed = !edit && isFilteredOut(a);
                  const isVacant = a.state === "VACANT" && a.listed;
                  return (
                    <div
                      key={a.id}
                      onPointerDown={(e) => down(e, a.id, a, "move")}
                      className={`absolute flex flex-col items-center justify-center text-black font-semibold leading-tight transition-all ${
                        edit ? "cursor-move" : "cursor-pointer hover:brightness-95"
                      }`}
                      style={{
                        left: a.x, top: a.y, width: a.w, height: a.h,
                        transform: a.rot ? `rotate(${a.rot}deg)` : undefined,
                        background: !a.listed && a.state === "VACANT" ? "#f5f5f4" : FILL[a.state],
                        borderRadius: a.shape === "CIRCLE" ? "9999px" : 10,
                        color: !a.listed && a.state === "VACANT" ? "#78716c" : "#111",
                        border: !a.listed && a.state === "VACANT"
                          ? "2px dashed #bdbdbd"
                          : `2px solid ${BORDER_COLOR[a.state]}`,
                        boxShadow: selIds.includes(a.id)
                          ? "0 6px 16px rgba(0,0,0,0.18)"
                          : "0 1px 3px rgba(17,17,17,.08)",
                        opacity: dimmed ? 0.22 : 1,
                        outline: selIds.includes(a.id) ? "3px solid #111" : "none",
                        outlineOffset: 2,
                      }}
                    >
                      {/* แถบหลังคา/สัญลักษณ์ด้านบนตามประเภทธุรกิจ เพื่อให้ดูเป็นรูปธรรมเข้าใจง่าย */}
                      {a.shape === "RECT" && category === "STALL" && a.h >= 45 && (
                        <span
                          className="absolute inset-x-0 top-0 h-2 rounded-t-[8px] pointer-events-none opacity-80"
                          style={{ backgroundImage: "repeating-linear-gradient(90deg, #f97316 0 8px, #fff 8px 16px)" }}
                        />
                      )}
                      {a.shape === "RECT" && category === "STORAGE" && a.h >= 45 && (
                        <span className="absolute bottom-0 inset-x-3 h-1.5 rounded-t bg-black/20 pointer-events-none" />
                      )}

                      <span className="flex flex-col items-center pointer-events-none px-1 text-center" style={{ transform: upright(a.rot) }}>
                        <span className="font-bold tracking-tight" style={{ fontSize: Math.max(11, Math.min(16, a.w / 5.2)) }}>
                          {a.code}
                        </span>
                        {a.h >= 48 && a.w >= 56 && (
                          <span className="text-[10px] font-normal text-ink2 line-clamp-1">
                            {a.size || dimText(a.w, a.h)}
                          </span>
                        )}
                        {a.h >= 64 && a.w >= 62 && a.price > 0 && (
                          <span className={`mt-0.5 rounded px-1 py-0.2 text-[10px] font-semibold ${isVacant ? "bg-ok/15 text-ok" : "bg-black/10 text-ink"}`}>
                            {baht(a.price)}/{a.period === "DAY" ? "ว." : "ด."}
                          </span>
                        )}
                      </span>
                      {handles(a.id, a)}
                    </div>
                  );
                })}
                {front.map(renderFeature)}
                {marquee && <div className="absolute border-2 border-brand bg-brand/10 pointer-events-none z-30" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}

                {/* หน้าจอเริ่มต้นเมื่อผังยังว่างเปล่า: มีปุ่มลัดสร้างผังใน 1 คลิก */}
                {!onFloor.length && !fOnFloor.length && (
                  <div className="absolute inset-0 grid place-items-center p-6 text-center">
                    {!editable ? (
                      <p className="text-muted">ร้านนี้ยังไม่ได้จัดวางผัง</p>
                    ) : (
                      <div className="max-w-md rounded-2xl border border-line bg-white/95 p-6 shadow-sm space-y-3">
                        <div className="text-3xl">{CATEGORIES[category].icon}</div>
                        <div className="text-lg font-bold">เริ่มต้นสร้างผัง{CATEGORIES[category].label}ของคุณ</div>
                        <p className="text-xs text-muted">
                          เลือกใช้แม่แบบสำเร็จรูปเพื่อให้ระบบวางทางเดิน โซน และ{unit}เช่าให้ครบในคลิกเดียว แล้วค่อยลากปรับแต่งเองเหมือน Canva
                        </p>
                        <div className="flex flex-wrap justify-center gap-2 pt-1">
                          {catTemplates[0] && (
                            <button
                              type="button"
                              disabled={pendingTpl}
                              onClick={() => useTemplate(catTemplates[0].id)}
                              className="btn"
                            >
                              {pendingTpl ? "กำลังสร้างผัง…" : `✨ สร้างผังด้วยแม่แบบ${CATEGORIES[category].label} (แนะนำ)`}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setEdit(true); setGen(true); }}
                            className="btn-ghost"
                          >
                            ⚡ วาง{unit}เป็นตารางอัตโนมัติ
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ปุ่มซูม */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-line bg-panel/95 p-1 shadow-sm">
            <button className="size-8 rounded-lg hover:bg-panel2 cursor-pointer text-lg leading-none disabled:opacity-30" title="ซูมออก (−)" disabled={zoom <= ZOOM_MIN} onClick={() => zoomTo(zoom / 1.25)}>−</button>
            <button className="min-w-14 h-8 rounded-lg hover:bg-panel2 cursor-pointer text-xs font-medium tabular-nums" title="พอดีกรอบ (0)" onClick={() => zoomTo(1)}>{Math.round(zoom * 100)}%</button>
            <button className="size-8 rounded-lg hover:bg-panel2 cursor-pointer text-lg leading-none disabled:opacity-30" title="ซูมเข้า (+)" disabled={zoom >= ZOOM_MAX} onClick={() => zoomTo(zoom * 1.25)}>+</button>
            <button className="h-8 px-2 rounded-lg hover:bg-panel2 cursor-pointer text-xs" title="พอดีกรอบ" onClick={() => zoomTo(1)}>⤢ พอดี</button>
          </div>
          {zoom !== 1 && <div className="absolute bottom-3 left-3 rounded-lg bg-ink/80 px-2 py-1 text-[11px] text-white pointer-events-none">Ctrl+ล้อเมาส์ ซูม · Space+ลาก เลื่อนผัง</div>}
        </div>

        {/* แถบจัดการด้านขวา (Inspector / Booking Panel) */}
        {gen && floor ? (
          <GenPanel key={floor.id} shopId={shopId} floorId={floor.id} category={category} unit={unit} onDone={(ids) => { if (ids?.length) record({ t: "create", ids }); setGen(false); }} />
        ) : selIds.length > 1 ? (
          <div className="card space-y-3 text-sm self-start">
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold">เลือก {selIds.length} รายการ</div>
              <button className="text-xs text-muted hover:text-ink underline cursor-pointer" onClick={() => setSelIds([])}>ยกเลิกเลือก</button>
            </div>
            <p className="text-xs text-muted">
              {unit} {selIds.filter(isAsset).length} · ของตกแต่งผัง {selIds.filter((i) => !isAsset(i)).length}
            </p>

            {/* เครื่องมือจัดเรียงตรงแนว (Canva Align & Distribute) */}
            <div className="space-y-1.5 border-t border-line pt-3">
              <div className="text-xs font-medium text-ink2">📐 จัดเรียงให้ตรงแนว (Align)</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => alignSelected("left")}>⫷ ชิดซ้าย</button>
                <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => alignSelected("centerX")}>⫿ กึ่งกลางตั้ง</button>
                <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => alignSelected("right")}>⫸ ชิดขวา</button>
                <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => alignSelected("top")}>⊤ ชิดบน</button>
                <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => alignSelected("centerY")}>⊶ กึ่งกลางนอน</button>
                <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => alignSelected("bottom")}>⊥ ชิดล่าง</button>
              </div>
              {selIds.length >= 3 && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => alignSelected("distH")}>↔ เว้นระยะแนวนอนเท่ากัน</button>
                  <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => alignSelected("distV")}>↕ เว้นระยะแนวตั้งเท่ากัน</button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => rotateBy(selIds, -90)}>⟲ หมุน -90°</button>
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => rotateBy(selIds, 90)}>⟳ หมุน +90°</button>
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => { copySelected(); paste(); }}>❐ ทำซ้ำทั้งกลุ่ม</button>
              <button className="btn-ghost !py-1.5 text-xs !text-danger" onClick={removeSelected}>🗑 ลบที่เลือก</button>
            </div>
            {selIds.some((i) => !isAsset(i)) && <ColorPicker value={null} onChange={(c) => setColor(selIds, c)} />}
            {editable && selIds.some(isAsset) && <BulkListing shopId={shopId} ids={selIds.filter(isAsset)} unit={unit} />}
          </div>
        ) : curFeat ? (
          <FeaturePanel
            key={curFeat.id}
            shopId={shopId}
            f={curFeat}
            onColor={(c) => setColor([curFeat.id], c)}
            onRotate={(d, abs) => (abs ? rotateTo(curFeat.id, d) : rotateBy([curFeat.id], d))}
            onDup={() => run(() => duplicateFeature(shopId, curFeat.id))}
            onRemove={() => removeWithUndo([curFeat.id])}
          />
        ) : (
          <Panel
            key={curAsset?.id ?? "none"}
            shopId={shopId}
            a={curAsset}
            allOnFloor={onFloor}
            onSelectAsset={(id) => setSel(id)}
            unit={unit}
            editable={!!editable}
            edit={edit}
            canRent={!!canRent}
            onShape={toggleShape}
            onRotate={(id, d, abs) => (abs ? rotateTo(id, d) : rotateBy([id], d))}
            onDup={(id) => run(() => duplicateAsset(shopId, id))}
            onRemove={(id) => removeWithUndo([id])}
          />
        )}
      </div>
    </div>
  );
}

function Panel({ shopId, a, allOnFloor, onSelectAsset, unit, editable, edit, canRent, onShape, onRotate, onDup, onRemove }: {
  shopId: string; a: FPAsset | null; allOnFloor: FPAsset[]; onSelectAsset: (id: string) => void;
  unit: string; editable: boolean; edit: boolean; canRent: boolean;
  onShape: (a: FPAsset) => void; onRotate: (id: string, deg: number, absolute?: boolean) => void; onDup: (id: string) => void; onRemove: (id: string) => void;
}) {
  const [st, act, pending] = useActionState(updateAsset.bind(null, shopId, a?.id ?? ""), undefined);

  if (!a) {
    const vacantList = allOnFloor.filter((x) => x.listed && x.price > 0 && x.state === "VACANT");
    return (
      <div className="card space-y-3 text-sm self-start">
        <div className="font-bold text-base">👆 แตะเลือก{unit}ในผัง</div>
        <p className="text-xs text-muted">
          {editable
            ? `คลิกที่${unit}หรือองค์ประกอบใดก็ได้บนผังเพื่อแก้ไขราคา ขนาด รูปภาพ หรือดูสัญญาเช่า`
            : `แตะที่${unit}สีขาวขอบเขียวในผังเพื่อดูรูปภาพ ขนาด และกรอกวันขอเช่าได้ทันที`}
        </p>
        {vacantList.length > 0 && (
          <div className="border-t border-line pt-3 space-y-2">
            <div className="text-xs font-semibold text-ok">● {unit}ว่างพร้อมเช่าในชั้นนี้ ({vacantList.length})</div>
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {vacantList.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectAsset(v.id)}
                  className="w-full flex items-center justify-between rounded-xl border border-line bg-panel2/60 hover:border-brand hover:bg-brand/10 px-3 py-2 text-left text-xs transition cursor-pointer"
                >
                  <div>
                    <span className="font-bold text-sm">{v.code}</span>{" "}
                    <span className="text-muted">{v.size || dimText(v.w, v.h)}</span>
                  </div>
                  <span className="font-semibold text-brand-ink">{baht(v.price)}/{PERIOD[v.period]} →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const l = a.lease;
  return (
    <div className="card space-y-3 text-sm self-start">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-bold">{a.code}</div>
          <div className="text-xs text-muted">{a.size ? `${a.size} · ` : ""}ขนาด {dimText(a.w, a.h)} ({areaText(a.w, a.h)})</div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_CLASS[a.state]}`}>{STATE_LABEL[a.state]}</span>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl bg-panel2 px-3 py-2">
        <div className="text-brand-ink font-bold text-base">
          {a.price > 0 ? <>{baht(a.price)} <span className="text-muted font-normal text-xs">/ {PERIOD[a.period]}</span></> : <span className="text-muted font-normal text-xs">ยังไม่ตั้งราคา</span>}
        </div>
        {(editable || !a.listed) && (
          <span className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${a.listed ? "bg-ok/15 text-ok" : "bg-line text-muted"}`}>
            {a.listed ? "● เปิดให้เช่า" : "ปิดเช่าอยู่"}
          </span>
        )}
      </div>

      {a.note && <p className="text-xs text-ink2 bg-panel2/50 rounded-lg px-2.5 py-1.5">{a.note}</p>}
      <Photos shopId={shopId} assetId={a.id} photos={a.photos} editable={editable} />

      {l ? (
        <div className="space-y-2 border-t border-line pt-3">
          <div><span className="text-muted">ผู้เช่า:</span> <b>{l.tenant}</b> {l.phone && <span className="text-muted">({l.phone})</span>}</div>
          <div><span className="text-muted">สัญญา:</span> {fmtDate(l.start)} – {fmtDate(l.end)}</div>
          <div><span className="text-muted">รอบชำระ:</span> {BILLING[l.billing as keyof typeof BILLING]}</div>
          <div className="space-y-1">
            {l.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-panel2 px-2.5 py-1.5 text-xs">
                <span>{fmtDate(p.due)} · {baht(p.amount)}</span>
                {p.paid ? <span className="text-ok">ชำระแล้ว</span> : editable ? (
                  <form action={markPaid.bind(null, p.id)}><button className={`font-semibold cursor-pointer ${p.due < Date.now() ? "text-danger" : "text-brand-ink"}`}>ยืนยันรับเงิน</button></form>
                ) : <span className="text-muted">รอชำระ</span>}
              </div>
            ))}
          </div>
        </div>
      ) : a.endDate ? (
        <div className="border-t border-line pt-3 text-muted text-xs">มีผู้เช่า · สัญญาถึง {fmtDate(a.endDate)}</div>
      ) : null}

      {/* สำหรับคนเช่า: ถ้าห้องว่าง เปิดฟอร์มจองให้กรอกวันได้ทันทีโดยไม่ต้องกดเปิด details ซ่อนไว้ */}
      {canRent && a.listed && a.price > 0 && !edit && (
        a.state === "VACANT" ? (
          <div className="rounded-xl border-2 border-brand bg-brand/5 p-3">
            <div className="font-bold text-sm">📅 จอง / ขอเช่า{unit}นี้ ({a.code})</div>
            <RentForm assetId={a.id} price={a.price} period={a.period} busy={a.busy} />
          </div>
        ) : (
          <details className="border-t border-line pt-3">
            <summary className="btn-ghost w-full list-none text-center">📅 จองล่วงหน้า (หลังหมดสัญญาปัจจุบัน)</summary>
            <RentForm assetId={a.id} price={a.price} period={a.period} busy={a.busy} />
          </details>
        )
      )}

      {/* สำหรับเจ้าของร้าน: บันทึกผู้เช่าหน้าร้าน (Walk-in) ลงในรายการว่างนี้ได้ทันที */}
      {editable && a.state === "VACANT" && a.price > 0 && (
        <details className="border-t border-line pt-3">
          <summary className="btn-ghost w-full list-none text-center text-xs font-semibold">👤 + ลงผู้เช่าหน้าร้าน (Walk-in)</summary>
          <div className="mt-2.5 rounded-xl bg-panel2/60 p-3">
            <WalkInForm shopId={shopId} unit={unit} assets={[a]} defaultAssetId={a.id} />
          </div>
        </details>
      )}

      {/* สำหรับเจ้าของร้าน: แก้ไขข้อมูลห้องได้ตลอดเวลาเมื่อคลิกเลือก */}
      {editable && (
        <form action={act} className="space-y-2.5 border-t border-line pt-3">
          <div className="font-semibold text-xs text-ink2">⚙️ ตั้งค่า{unit}นี้</div>
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">รหัส/ชื่อ</span><input name="code" defaultValue={a.code} required className="input" /></label>
            <label><span className="label">ป้ายขนาด/รุ่น</span><input name="size" defaultValue={a.size ?? ""} placeholder="เช่น S, รถเก๋ง" className="input" /></label>
            <label key={`w${a.w}`}><span className="label">กว้าง (เมตร)</span><input name="wm" type="number" min={1} step={0.5} defaultValue={toM(a.w)} required className="input" /></label>
            <label key={`h${a.h}`}><span className="label">ยาว (เมตร)</span><input name="hm" type="number" min={1} step={0.5} defaultValue={toM(a.h)} required className="input" /></label>
            <label><span className="label">ราคาเช่า (บาท)</span><input name="price" type="number" min={0} defaultValue={a.price} className="input" /></label>
            <label><span className="label">คิดราคาต่อ</span><select name="period" defaultValue={a.period} className="input"><option value="MONTH">เดือน</option><option value="DAY">วัน</option></select></label>
          </div>
          <label><span className="label">หมายเหตุเพิ่มเติม</span><input name="note" defaultValue={a.note ?? ""} placeholder="เช่น ติดทางเดิน, มีปลั๊กไฟ" className="input" /></label>
          <label className="flex items-center gap-2 rounded-xl border border-line bg-panel2/50 px-3 py-2 cursor-pointer">
            <input key={`l${a.listed}`} type="checkbox" name="listed" defaultChecked={a.listed} className="size-4 accent-[#16a34a]" />
            <span>เปิดให้เช่าทันที <span className="text-xs text-muted">(ต้องตั้งราคา &gt; 0)</span></span>
          </label>
          {st?.error && <p className="text-danger text-xs">{st.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn flex-1" disabled={pending}>{pending ? "กำลังบันทึก…" : "💾 บันทึกข้อมูล"}</button>
            {edit && <button type="button" className="btn-ghost" onClick={() => onDup(a.id)}>❐ ทำซ้ำ</button>}
          </div>
          {edit && (
            <>
              <RotateRow rot={a.rot} onRotate={(d, abs) => onRotate(a.id, d, abs)} />
              <div className="flex flex-wrap justify-between gap-2 pt-1">
                <button type="button" className="btn-ghost text-xs !py-1.5" onClick={() => onShape(a)}>
                  {a.shape === "RECT" ? "◯ เปลี่ยนเป็นวงกลม" : "▭ เปลี่ยนเป็นสี่เหลี่ยม"}
                </button>
                <button type="button" className="btn-ghost text-xs !py-1.5 !text-danger" onClick={() => onRemove(a.id)}>
                  🗑 ลบ{unit}นี้
                </button>
              </div>
            </>
          )}
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
      <div className="text-lg font-bold">{GLYPH[f.kind]} {FEATURES[f.kind]?.label ?? f.kind}</div>
      <div className="text-xs text-muted">ขนาด {dimText(f.w, f.h)} · องค์ประกอบตกแต่งผัง</div>
      <label className="block"><span className="label">ชนิดองค์ประกอบ</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as FeatureKind)} className="input">
          {(Object.keys(FEATURES) as FeatureKind[]).map((k) => <option key={k} value={k}>{GLYPH[k]} {FEATURES[k].label}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">ป้ายข้อความบนผัง</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={FEATURES[kind]?.label} className="input" />
      </label>
      <ColorPicker value={f.color} onChange={onColor} />
      <RotateRow rot={f.rot} onRotate={onRotate} />
      <div className="flex flex-wrap gap-2">
        <button className="btn flex-1" disabled={pending} onClick={save}>💾 บันทึก</button>
        <button className="btn-ghost" onClick={onDup}>❐ ทำซ้ำ</button>
        <button className="btn-ghost !text-danger" onClick={onRemove}>🗑 ลบ</button>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pick = (c: string) => { clearTimeout(timer.current); timer.current = setTimeout(() => onChange(c), 250); };
  return (
    <div>
      <span className="label">สีขององค์ประกอบ</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            className={`size-6 rounded-full border border-black/10 cursor-pointer transition-transform hover:scale-110 ${value === c ? "ring-2 ring-offset-2 ring-ink" : ""}`}
            style={{ background: c }}
          />
        ))}
        <label title="เลือกสีเอง" className={`relative size-6 rounded-full border border-line cursor-pointer overflow-hidden grid place-items-center text-xs ${value && !PALETTE.includes(value) ? "ring-2 ring-offset-2 ring-ink" : ""}`}
          style={{ background: value && !PALETTE.includes(value) ? value : "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
          <input type="color" value={value ?? "#ffc700"} onChange={(e) => pick(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <button type="button" onClick={() => onChange(null)} className={`btn-ghost !py-1 !px-2 text-xs ${value === null ? "pill-on" : ""}`}>สีมาตรฐาน</button>
      </div>
    </div>
  );
}

function RotateRow({ rot, onRotate }: { rot: number; onRotate: (deg: number, absolute?: boolean) => void }) {
  const commit = (el: HTMLInputElement) => { const v = Number(el.value); if (Number.isFinite(v) && norm(v) !== rot) onRotate(v, true); };
  return (
    <div className="flex items-center gap-2">
      <span className="label !mb-0">หมุน</span>
      <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => onRotate(-90)}>⟲ -90°</button>
      <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => onRotate(90)}>⟳ +90°</button>
      <input
        key={rot}
        type="number"
        defaultValue={rot}
        step={15}
        className="input !w-20 !py-1"
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(e.currentTarget); } }}
      />
      <span className="text-muted text-xs">องศา</span>
    </div>
  );
}

function FloorInlineSettings({ shopId, floor, canDelete, onDeleted }: { shopId: string; floor: FPFloor; canDelete: boolean; onDeleted: () => void }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState({ name: floor.name, w: toM(floor.w), h: toM(floor.h) });
  const [msg, setMsg] = useState<string | null>(null);
  const SIZES = [[50, 30, "ขนาดมาตรฐาน (50×30 ม.)"], [80, 50, "ขนาดกลาง (80×50 ม.)"], [120, 75, "ขนาดใหญ่ (120×75 ม.)"]] as const;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="w-44"><span className="label">ชื่อชั้น / โซน</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="input !py-1.5" /></label>
      <label className="w-28"><span className="label">กว้าง (เมตร)</span><input type="number" value={v.w} min={15} max={toM(CANVAS.maxW)} step={1} onChange={(e) => setV({ ...v, w: +e.target.value })} className="input !py-1.5" /></label>
      <label className="w-28"><span className="label">ยาว (เมตร)</span><input type="number" value={v.h} min={10} max={toM(CANVAS.maxH)} step={1} onChange={(e) => setV({ ...v, h: +e.target.value })} className="input !py-1.5" /></label>
      <div className="flex flex-wrap gap-1.5">
        {SIZES.map(([w, h, t]) => <button key={t} type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setV({ ...v, w, h })}>{t}</button>)}
      </div>
      <button className="btn !py-1.5" disabled={pending} onClick={() => start(async () => { const r = await updateFloor(shopId, floor.id, { name: v.name, w: toPx(v.w), h: toPx(v.h) }); setMsg(r?.error ?? null); })}>
        บันทึกขนาดผัง
      </button>
      {canDelete && (
        <button className="btn-ghost !py-1.5 !text-danger text-xs" disabled={pending} onClick={() => {
          if (!confirm(`ลบ ${floor.name}? องค์ประกอบผังในชั้นนี้จะถูกลบด้วย`)) return;
          start(async () => { const r = await deleteFloor(shopId, floor.id); if (r?.error) setMsg(r.error); else onDeleted(); });
        }}>ลบชั้นนี้</button>
      )}
      {msg && <p className="text-xs text-danger w-full">{msg}</p>}
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
      <div className="text-lg font-bold">⚡ วาง{unit}เรียงเป็นตารางอัตโนมัติ</div>
      <p className="text-xs text-muted">สร้าง{unit}หลายรายการพร้อมทางเดินคั่นในคลิกเดียว (ตั้งราคาแล้วเปิดให้เช่าได้ทันที)</p>
      <div className="grid grid-cols-2 gap-2">
        <N name="rows" label="จำนวนแถว" v={p.rows} min={1} />
        <N name="cols" label={`${unit}ต่อแถว`} v={p.cols} min={1} />
        <N name="w" label="กว้าง (ม.)" v={toM(p.w)} min={1} step={0.5} />
        <N name="h" label="ยาว (ม.)" v={toM(p.h)} min={1} step={0.5} />
        <N name="gap" label="ระยะห่าง (ม.)" v={toM(p.gap)} step={0.5} />
        <label><span className="label">แทรกทางเดินทุก ๆ</span>
          <select name="aisleEvery" defaultValue={p.aisleEvery} className="input">
            <option value={0}>ไม่มีทางเดิน</option>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} แถว</option>)}
          </select>
        </label>
        <N name="aisle" label="ทางเดินกว้าง (ม.)" v={toM(p.aisle || 60)} min={1} step={0.5} />
        <label><span className="label">คำนำหน้ารหัส</span><input name="prefix" defaultValue={p.prefix} maxLength={5} className="input" /></label>
        <N name="price" label="ราคาเริ่มต้น (บาท)" v={1500} />
        <label><span className="label">ต่อ</span><select name="period" defaultValue="MONTH" className="input"><option value="MONTH">เดือน</option><option value="DAY">วัน</option></select></label>
      </div>
      <label className="block"><span className="label">ป้ายขนาด (ไม่บังคับ)</span><input name="size" placeholder="เช่น มาตรฐาน, S, M" className="input" /></label>
      {st?.error && <p className="text-danger text-xs">{st.error}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={pending}>{pending ? "กำลังสร้าง…" : `⚡ สร้าง${unit}ทั้งหมด`}</button>
        <button type="button" className="btn-ghost" onClick={() => onDone()}>ยกเลิก</button>
      </div>
    </form>
  );
}
