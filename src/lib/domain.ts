export const CATEGORIES = {
  STORAGE: { label: "ห้องเก็บของ", icon: "📦", unit: "ห้อง" },
  PARKING: { label: "ที่จอดรถ", icon: "🅿️", unit: "ช่องจอด" },
  STALL: { label: "แผงร้านค้าในตลาด", icon: "🏪", unit: "แผง" },
  CAR: { label: "รถเช่า", icon: "🚗", unit: "คัน" },
  BOAT: { label: "เรือเช่า", icon: "⛵", unit: "ลำ" },
} as const;
export type Category = keyof typeof CATEGORIES;

export const BILLING = { MONTH: "รายเดือน", HALF_YEAR: "ราย 6 เดือน", YEAR: "รายปี" } as const;
export const PERIOD = { DAY: "วัน", MONTH: "เดือน" } as const;
export const baht = (n: number) => "฿" + n.toLocaleString("th-TH");
export const fmtDate = (d: Date | number) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

const DAY = 86400000;
export const daysBetween = (a: Date, b: Date) => Math.max(1, Math.ceil((+b - +a) / DAY));
export function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/** สร้างตารางใบแจ้งหนี้ตามรอบชำระ */
export function buildPayments(opts: { price: number; period: "DAY" | "MONTH"; start: Date; end: Date; billing: "MONTH" | "HALF_YEAR" | "YEAR" }) {
  const { price, period, start, end, billing } = opts;
  if (period === "DAY") return [{ amount: price * daysBetween(start, end), dueDate: start }];
  const step = billing === "MONTH" ? 1 : billing === "HALF_YEAR" ? 6 : 12;
  const totalMonths = Math.max(1, Math.ceil((+end - +start) / (30.44 * DAY)));
  const out: { amount: number; dueDate: Date }[] = [];
  for (let m = 0; m < totalMonths; m += step) {
    out.push({ amount: price * Math.min(step, totalMonths - m), dueDate: addMonths(start, m) });
  }
  return out;
}

export type AssetState = "VACANT" | "OCCUPIED" | "EXPIRING" | "PENDING";
export function assetState(leases: { status: string; endDate: Date; startDate: Date }[], now = new Date()): AssetState {
  const active = leases.find((l) => l.status === "ACTIVE" && +l.endDate >= +now);
  if (active) return +active.endDate - +now <= 30 * DAY ? "EXPIRING" : "OCCUPIED";
  if (leases.some((l) => l.status === "PENDING")) return "PENDING";
  return "VACANT";
}
export const STATE_LABEL: Record<AssetState, string> = { VACANT: "ว่าง", OCCUPIED: "มีผู้เช่า", EXPIRING: "ใกล้หมดสัญญา", PENDING: "รออนุมัติ" };
export const STATE_CLASS: Record<AssetState, string> = {
  VACANT: "bg-slate-600 text-slate-200",
  OCCUPIED: "bg-brand text-black",
  EXPIRING: "bg-amber-500/90 text-black",
  PENDING: "bg-sky-500/80 text-black",
};

/* ---------- ผัง (floor plan) ---------- */
export const CANVAS = { w: 1000, h: 600, grid: 10, maxW: 3000, maxH: 2000 };

/** มาตราส่วนผัง: 1 เมตร = 20 px (1 ช่องกริด = 0.5 ม.) */
export const PX_PER_M = 20;
export const MIN_ASSET_PX = PX_PER_M; // ห้อง/ช่องเล็กสุด 1 ม.
export const toM = (px: number) => Math.round((px / PX_PER_M) * 10) / 10;
export const toPx = (m: number) => Math.round(m * PX_PER_M);
const n1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH");
export const dimText = (w: number, h: number) => `${n1(toM(w))} × ${n1(toM(h))} ม.`;
export const areaText = (w: number, h: number) => `${n1(toM(w) * toM(h))} ตร.ม.`;

export type FeatureKind = "ZONE" | "ROAD" | "WALL" | "ENTRANCE" | "STAIRS" | "TOILET" | "OFFICE" | "TEXT";
/** องค์ประกอบผังที่ไม่ได้ให้เช่า พร้อมขนาดเริ่มต้น; back=true วาดไว้ใต้ห้อง */
export const FEATURES: Record<FeatureKind, { label: string; w: number; h: number; back?: boolean }> = {
  ZONE: { label: "โซน/พื้นที่", w: 300, h: 200, back: true },
  ROAD: { label: "ทางเดิน/ถนน", w: 400, h: 60, back: true },
  WALL: { label: "ผนัง", w: 200, h: 10 },
  ENTRANCE: { label: "ทางเข้า-ออก", w: 80, h: 40 },
  STAIRS: { label: "บันได/ลิฟต์", w: 60, h: 60 },
  TOILET: { label: "ห้องน้ำ", w: 60, h: 60 },
  OFFICE: { label: "สำนักงาน", w: 100, h: 60 },
  TEXT: { label: "ข้อความ", w: 160, h: 30 },
};

/** ค่าเริ่มต้นของตัวช่วยสร้างผังอัตโนมัติ ตามประเภทธุรกิจ */
export const LAYOUT_PRESET: Record<Category, { prefix: string; w: number; h: number; gap: number; rows: number; cols: number; aisleEvery: number; aisle: number }> = {
  STORAGE: { prefix: "A", w: 100, h: 70, gap: 10, rows: 4, cols: 6, aisleEvery: 2, aisle: 60 },
  PARKING: { prefix: "P", w: 50, h: 100, gap: 0, rows: 2, cols: 12, aisleEvery: 1, aisle: 120 },
  STALL: { prefix: "S", w: 80, h: 60, gap: 10, rows: 4, cols: 8, aisleEvery: 2, aisle: 70 },
  CAR: { prefix: "C", w: 50, h: 100, gap: 10, rows: 1, cols: 8, aisleEvery: 0, aisle: 0 },
  BOAT: { prefix: "B", w: 60, h: 140, gap: 20, rows: 1, cols: 6, aisleEvery: 0, aisle: 0 },
};
export function defaultBox(index: number) {
  return { x: 20 + (index % 8) * 120, y: 20 + Math.floor(index / 8) * 90, w: 100, h: 70 };
}
