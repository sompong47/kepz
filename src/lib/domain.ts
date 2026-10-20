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
export const CANVAS = { w: 1000, h: 600, grid: 10 };
export function defaultBox(index: number) {
  return { x: 20 + (index % 8) * 120, y: 20 + Math.floor(index / 8) * 90, w: 100, h: 70 };
}
