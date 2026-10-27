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
  VACANT: "bg-[#e5e5e5] text-ink2",
  OCCUPIED: "bg-brand text-ink",
  EXPIRING: "bg-orange-400 text-ink",
  PENDING: "bg-sky-400 text-ink",
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

export type FeatureKind = "ZONE" | "ROAD" | "WALL" | "ENTRANCE" | "STAIRS" | "TOILET" | "OFFICE" | "TEXT" | "WATER" | "GREEN" | "PILLAR" | "DOOR" | "ARROW";
/** องค์ประกอบผังที่ไม่ได้ให้เช่า พร้อมขนาดเริ่มต้น; back=true วาดไว้ใต้ห้อง */
export const FEATURES: Record<FeatureKind, { label: string; w: number; h: number; back?: boolean }> = {
  ZONE: { label: "โซน/พื้นที่", w: 300, h: 200, back: true },
  ROAD: { label: "ทางเดิน/ถนน", w: 400, h: 60, back: true },
  WATER: { label: "แหล่งน้ำ/ทะเล", w: 400, h: 180, back: true },
  GREEN: { label: "สวน/ต้นไม้", w: 120, h: 80, back: true },
  WALL: { label: "ผนัง/รั้ว", w: 200, h: 10 },
  ENTRANCE: { label: "ทางเข้า-ออก", w: 100, h: 40 },
  OFFICE: { label: "สำนักงาน/จุดติดต่อ", w: 110, h: 60 },
  TOILET: { label: "ห้องน้ำ", w: 70, h: 60 },
  STAIRS: { label: "บันได/ลิฟต์", w: 70, h: 60 },
  TEXT: { label: "ป้ายข้อความ", w: 160, h: 30 },
  PILLAR: { label: "เสา", w: 20, h: 20 },
  DOOR: { label: "ประตู", w: 40, h: 40 },
  ARROW: { label: "ลูกศรทิศทาง", w: 80, h: 30 },
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

export type TemplateFeature = { kind: FeatureKind; label?: string; x: number; y: number; w: number; h: number; rot?: number; color?: string };
export type TemplateAsset = { prefix: string; size: string; price: number; period: "DAY" | "MONTH"; x: number; y: number; w: number; h: number; shape?: "RECT" | "CIRCLE"; rot?: number };
export type FloorTemplate = {
  id: string;
  category: Category;
  name: string;
  desc: string;
  badge: string;
  w: number;
  h: number;
  features: TemplateFeature[];
  assets: TemplateAsset[];
};

/** แม่แบบผังสำเร็จรูป กดคลิกเดียวได้ผังพร้อมโครงสร้างและห้องเช่าทันที */
export const FLOOR_TEMPLATES: FloorTemplate[] = [
  {
    id: "storage-standard",
    category: "STORAGE",
    name: "โกดังห้องเก็บของมาตรฐาน (ไซส์ S / M / L)",
    desc: "มีทางเดินหลัก สำนักงาน ห้องน้ำ ลิฟต์ขนของ และห้องเก็บของ 3 ขนาดพร้อมราคาแนะนำ",
    badge: "ยอดนิยม",
    w: 1000,
    h: 600,
    features: [
      { kind: "ZONE", label: "โซนห้องขนาดเล็ก (S)", x: 40, y: 30, w: 660, h: 190, color: "#0284c7" },
      { kind: "ROAD", label: "ทางเดินหลัก (กว้าง 3.5 ม.)", x: 40, y: 230, w: 920, h: 70 },
      { kind: "ZONE", label: "โซนห้องขนาดกลาง-ใหญ่ (M / L)", x: 40, y: 310, w: 660, h: 250, color: "#f97316" },
      { kind: "OFFICE", label: "สำนักงาน / CCTV", x: 730, y: 40, w: 140, h: 80 },
      { kind: "TOILET", label: "ห้องน้ำ", x: 880, y: 40, w: 80, h: 80 },
      { kind: "STAIRS", label: "ลิฟต์ขนของ", x: 730, y: 130, w: 110, h: 80 },
      { kind: "ENTRANCE", label: "ประตูโหลดของ", x: 780, y: 490, w: 180, h: 60 },
    ],
    assets: [
      ...Array.from({ length: 6 }, (_, c) => ({ prefix: "S", size: "S (2.5×1.5ม.)", price: 1200, period: "MONTH" as const, x: 60 + c * 100, y: 65, w: 90, h: 60 })),
      ...Array.from({ length: 6 }, (_, c) => ({ prefix: "S", size: "S (2.5×1.5ม.)", price: 1200, period: "MONTH" as const, x: 60 + c * 100, y: 140, w: 90, h: 60 })),
      ...Array.from({ length: 5 }, (_, c) => ({ prefix: "M", size: "M (3×2ม.)", price: 2200, period: "MONTH" as const, x: 60 + c * 125, y: 345, w: 115, h: 80 })),
      ...Array.from({ length: 4 }, (_, c) => ({ prefix: "L", size: "L (4×2.5ม.)", price: 3500, period: "MONTH" as const, x: 60 + c * 155, y: 445, w: 145, h: 95 })),
    ],
  },
  {
    id: "parking-lot",
    category: "PARKING",
    name: "ลานจอดรถ 2 เลน + โซน VIP ในร่ม",
    desc: "ถนนวิ่งรถตรงกลาง ทางเข้า-ออก ป้อมยาม และช่องจอดรถ 20 ช่อง",
    badge: "พร้อมใช้ทันที",
    w: 1000,
    h: 600,
    features: [
      { kind: "ZONE", label: "โซนจอดในร่ม VIP", x: 180, y: 30, w: 780, h: 150, color: "#ffc700" },
      { kind: "ROAD", label: "เลนวิ่งรถหลัก ← →", x: 40, y: 200, w: 920, h: 120 },
      { kind: "ZONE", label: "โซนจอดมาตรฐาน", x: 180, y: 340, w: 780, h: 150, color: "#757575" },
      { kind: "ENTRANCE", label: "ทางเข้า-ออก", x: 40, y: 80, w: 120, h: 90 },
      { kind: "OFFICE", label: "ป้อมยาม / แลกบัตร", x: 40, y: 350, w: 120, h: 80 },
      { kind: "GREEN", label: "สวนหย่อม", x: 40, y: 450, w: 120, h: 110 },
      { kind: "TOILET", label: "ห้องน้ำ", x: 860, y: 510, w: 100, h: 60 },
    ],
    assets: [
      ...Array.from({ length: 10 }, (_, c) => ({ prefix: "V", size: "VIP ในร่ม", price: 3000, period: "MONTH" as const, x: 200 + c * 74, y: 60, w: 64, h: 110 })),
      ...Array.from({ length: 10 }, (_, c) => ({ prefix: "P", size: "รถเก๋ง/กระบะ", price: 2000, period: "MONTH" as const, x: 200 + c * 74, y: 360, w: 64, h: 110 })),
    ],
  },
  {
    id: "market-plaza",
    category: "STALL",
    name: "ตลาดนัด / พลาซ่าแบ่งโซนอาหาร & แฟชั่น",
    desc: "แยกโซนอาหาร โซนเสื้อผ้า ทางเดินคนเดิน จุดนั่งพัก และห้องน้ำครบ",
    badge: "ขายดี",
    w: 1000,
    h: 600,
    features: [
      { kind: "ENTRANCE", label: "ซุ้มประตูตลาด", x: 420, y: 20, w: 160, h: 45 },
      { kind: "ROAD", label: "ทางเดินกลางตลาด", x: 450, y: 75, w: 100, h: 495 },
      { kind: "ZONE", label: "โซน A: อาหารและเครื่องดื่ม", x: 40, y: 75, w: 390, h: 380, color: "#f97316" },
      { kind: "ZONE", label: "โซน B: เสื้อผ้าและสินค้าทั่วไป", x: 570, y: 75, w: 390, h: 380, color: "#db2777" },
      { kind: "ROAD", label: "ซอยเดินโซน A", x: 55, y: 235, w: 360, h: 55 },
      { kind: "ROAD", label: "ซอยเดินโซน B", x: 585, y: 235, w: 360, h: 55 },
      { kind: "GREEN", label: "ลานนั่งทานอาหาร / ดนตรีสด", x: 40, y: 470, w: 390, h: 100 },
      { kind: "OFFICE", label: "สำนักงานตลาด", x: 570, y: 480, w: 180, h: 80 },
      { kind: "TOILET", label: "ห้องน้ำรวม", x: 770, y: 480, w: 190, h: 80 },
    ],
    assets: [
      ...Array.from({ length: 4 }, (_, c) => ({ prefix: "A", size: "แผงอาหาร 2×2ม.", price: 300, period: "DAY" as const, x: 60 + c * 90, y: 120, w: 80, h: 70 })),
      ...Array.from({ length: 4 }, (_, c) => ({ prefix: "A", size: "แผงอาหาร 2×2ม.", price: 300, period: "DAY" as const, x: 60 + c * 90, y: 310, w: 80, h: 70 })),
      ...Array.from({ length: 4 }, (_, c) => ({ prefix: "B", size: "ล็อกแฟชั่น 2×2ม.", price: 250, period: "DAY" as const, x: 590 + c * 90, y: 120, w: 80, h: 70 })),
      ...Array.from({ length: 4 }, (_, c) => ({ prefix: "B", size: "ล็อกแฟชั่น 2×2ม.", price: 250, period: "DAY" as const, x: 590 + c * 90, y: 310, w: 80, h: 70 })),
    ],
  },
  {
    id: "car-rental-hub",
    category: "CAR",
    name: "ศูนย์บริการรถเช่า (แยกโซน Eco / SUV / Van)",
    desc: "จุดรับ-คืนรถ สำนักงานติดแอร์ และช่องจอดแสดงรุ่นรถเช่าชัดเจน",
    badge: "เข้าใจง่าย",
    w: 1000,
    h: 600,
    features: [
      { kind: "OFFICE", label: "เคาน์เตอร์รับ-คืนรถ", x: 50, y: 40, w: 220, h: 90 },
      { kind: "TOILET", label: "ห้องน้ำลูกค้า", x: 290, y: 40, w: 110, h: 90 },
      { kind: "ENTRANCE", label: "จุดรับ-ส่งรถ", x: 760, y: 40, w: 190, h: 90 },
      { kind: "ZONE", label: "โซน Eco Car & รถเก๋ง", x: 50, y: 160, w: 900, h: 180, color: "#0284c7" },
      { kind: "ROAD", label: "ทางวิ่งรถออก", x: 50, y: 355, w: 900, h: 65 },
      { kind: "ZONE", label: "โซน SUV & รถตู้ครอบครัว", x: 50, y: 435, w: 900, h: 145, color: "#16a34a" },
    ],
    assets: [
      ...Array.from({ length: 6 }, (_, c) => ({ prefix: "ECO-", size: "Eco Car 5 ที่นั่ง", price: 900, period: "DAY" as const, x: 80 + c * 140, y: 205, w: 115, h: 115 })),
      ...Array.from({ length: 5 }, (_, c) => ({ prefix: "SUV-", size: "SUV / รถตู้ 7-11 ที่นั่ง", price: 1800, period: "DAY" as const, x: 80 + c * 170, y: 470, w: 145, h: 95 })),
    ],
  },
  {
    id: "boat-marina",
    category: "BOAT",
    name: "ท่าเทียบเรือ & มารีน่า (Speedboat / เรือนำเที่ยว)",
    desc: "ผังชายฝั่งพร้อมโซนผืนน้ำ สะพานเทียบเรือ จุดจำหน่ายตั๋ว และช่องจอดเรือ",
    badge: "สวยงาม",
    w: 1000,
    h: 600,
    features: [
      { kind: "GREEN", label: "สวนริมหาด / จุดพักคอย", x: 40, y: 30, w: 260, h: 120 },
      { kind: "OFFICE", label: "จุดเช็กอิน / รับชูชีพ", x: 320, y: 30, w: 240, h: 120 },
      { kind: "TOILET", label: "ห้องน้ำ / ห้องอาบน้ำ", x: 580, y: 30, w: 170, h: 120 },
      { kind: "ENTRANCE", label: "ทางเข้าท่าเรือ", x: 770, y: 30, w: 190, h: 120 },
      { kind: "WATER", label: "ทะเล / โซนจอดเรือ", x: 40, y: 170, w: 920, h: 400 },
      { kind: "ROAD", label: "สะพานท่าเทียบเรือหลัก (Pier)", x: 440, y: 150, w: 120, h: 380 },
    ],
    assets: [
      ...Array.from({ length: 3 }, (_, r) => ({ prefix: "SB-", size: "สปีดโบ๊ท 10 ที่นั่ง", price: 4500, period: "DAY" as const, x: 240, y: 200 + r * 115, w: 170, h: 85 })),
      ...Array.from({ length: 3 }, (_, r) => ({ prefix: "YT-", size: "เรือยอชต์ / นำเที่ยว 20 ที่นั่ง", price: 8500, period: "DAY" as const, x: 590, y: 200 + r * 115, w: 190, h: 85 })),
    ],
  },
];


/** สร้างลิงก์เปิด Google Maps จาก mapUrl หรือชื่อทำเลที่ตั้ง */
export function googleMapsHref(location?: string | null, mapUrl?: string | null, fallbackName?: string): string | null {
  const raw = (mapUrl ?? "").trim();
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  const q = (raw || location || fallbackName || "").trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/* ---------- ช่องทางรับเงิน ---------- */
export const BANKS = ["กสิกรไทย", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "กรุงศรีอยุธยา", "ทหารไทยธนชาต (ttb)", "ออมสิน", "ธ.ก.ส.", "ยูโอบี", "ซีไอเอ็มบี", "เกียรตินาคินภัทร", "แลนด์ แอนด์ เฮ้าส์"] as const;
export type PayInfo = { payBank: string | null; payAccountNo: string | null; payAccountName: string | null; payPromptpay: string | null; payQr: string | null; payNote: string | null };
/** ร้านตั้งช่องทางรับเงินแล้วหรือยัง (บัญชีครบ หรือ พร้อมเพย์ หรือ QR อย่างใดอย่างหนึ่ง) */
export const hasPayInfo = (s: PayInfo) => !!((s.payBank && s.payAccountNo && s.payAccountName) || s.payPromptpay || s.payQr);
