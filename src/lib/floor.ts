import { assetState, defaultBox, type AssetState, type FeatureKind } from "./domain";

export type FPFloor = {
  id: string; name: string; w: number; h: number;
  bgImage?: string | null; bgX?: number; bgY?: number; bgW?: number | null; bgH?: number | null; bgOpacity?: number; bgShow?: boolean;
};
export type FPFeature = { id: string; floorId: string; kind: FeatureKind; label: string | null; x: number; y: number; w: number; h: number; rot: number; color: string | null; grp?: string | null; locked?: boolean };
export type FPPayment = { id: string; amount: number; due: number; paid: number | null; slip: string | null };
export type FPAsset = {
  id: string; floorId: string; code: string; size: string | null; price: number; period: "DAY" | "MONTH"; note: string | null;
  x: number; y: number; w: number; h: number; rot: number; shape: "RECT" | "CIRCLE" | "L"; listed: boolean; grp: string | null; locked: boolean;
  state: AssetState; endDate: number | null; photos: string[]; busy: { start: number; end: number }[];
  lease: null | { id: string; tenant: string; phone: string | null; isWalkIn?: boolean; start: number; end: number; billing: string; payments: FPPayment[] };
};

type Src = {
  id: string; floorId: string | null; code: string; size: string | null; price: number; period: "DAY" | "MONTH"; note: string | null;
  x: number | null; y: number | null; w: number | null; h: number | null; rot: number; shape: "RECT" | "CIRCLE" | "L"; listed: boolean; grp?: string | null; locked?: boolean;
  photos?: { id: string; createdAt: Date | null }[];
  leases: {
    id: string; status: string; startDate: Date; endDate: Date; billing: string;
    guestName?: string | null; guestPhone?: string | null;
    tenant?: { name: string; phone: string | null };
    payments?: { id: string; amount: number; dueDate: Date; paidAt: Date | null; slip?: string | null }[];
  }[];
};

/** แปลงข้อมูลจาก DB เป็นข้อมูลสำหรับผัง; detail=false (สาธารณะ) จะไม่ส่งชื่อผู้เช่า/การชำระเงิน */
export function toFP(rows: Src[], detail: boolean, firstFloorId: string): FPAsset[] {
  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
  const seen: Record<string, number> = {};
  return sorted.map((a) => {
    const floorId = a.floorId ?? firstFloorId;
    const d = defaultBox((seen[floorId] = (seen[floorId] ?? -1) + 1));
    const active = a.leases.find((l) => l.status === "ACTIVE" && +l.endDate >= Date.now());
    const tenantName = active?.guestName || active?.tenant?.name;
    const tenantPhone = active?.guestName ? (active.guestPhone ?? null) : (active?.tenant?.phone ?? null);
    return {
      id: a.id, floorId, code: a.code, size: a.size, price: a.price, period: a.period, note: a.note, shape: a.shape,
      x: a.x ?? d.x, y: a.y ?? d.y, w: a.w ?? d.w, h: a.h ?? d.h, rot: a.rot, listed: a.listed, grp: a.grp ?? null, locked: !!a.locked,
      state: assetState(a.leases), endDate: active ? +active.endDate : null,
      busy: a.leases.filter((l) => l.status === "ACTIVE").map((l) => ({ start: +l.startDate, end: +l.endDate })),
      photos: [...(a.photos ?? [])].sort((p, q) => +(p.createdAt ?? 0) - +(q.createdAt ?? 0)).map((p) => p.id),
      lease: detail && active && tenantName
        ? {
            id: active.id,
            tenant: tenantName,
            phone: tenantPhone,
            isWalkIn: !!active.guestName,
            start: +active.startDate,
            end: +active.endDate,
            billing: active.billing,
            payments: (active.payments ?? []).map((p) => ({ id: p.id, amount: p.amount, due: +p.dueDate, paid: p.paidAt ? +p.paidAt : null, slip: p.slip ?? null })).sort((x, y) => x.due - y.due),
          }
        : null,
    };
  });
}
