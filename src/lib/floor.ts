import { assetState, defaultBox, type AssetState } from "./domain";

export type FPPayment = { id: string; amount: number; due: number; paid: number | null };
export type FPAsset = {
  id: string; code: string; size: string | null; price: number; period: "DAY" | "MONTH"; note: string | null;
  x: number; y: number; w: number; h: number; shape: "RECT" | "CIRCLE";
  state: AssetState; endDate: number | null;
  lease: null | { id: string; tenant: string; phone: string | null; start: number; end: number; billing: string; payments: FPPayment[] };
};

type Src = {
  id: string; code: string; size: string | null; price: number; period: "DAY" | "MONTH"; note: string | null;
  x: number | null; y: number | null; w: number | null; h: number | null; shape: "RECT" | "CIRCLE";
  leases: { id: string; status: string; startDate: Date; endDate: Date; billing: string; tenant?: { name: string; phone: string | null }; payments?: { id: string; amount: number; dueDate: Date; paidAt: Date | null }[] }[];
};

/** แปลงข้อมูลจาก DB เป็นข้อมูลสำหรับผัง; detail=false (สาธารณะ) จะไม่ส่งชื่อผู้เช่า/การชำระเงิน */
export function toFP(rows: Src[], detail: boolean): FPAsset[] {
  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
  return sorted.map((a, i) => {
    const d = defaultBox(i);
    const active = a.leases.find((l) => l.status === "ACTIVE" && +l.endDate >= Date.now());
    return {
      id: a.id, code: a.code, size: a.size, price: a.price, period: a.period, note: a.note, shape: a.shape,
      x: a.x ?? d.x, y: a.y ?? d.y, w: a.w ?? d.w, h: a.h ?? d.h,
      state: assetState(a.leases), endDate: active ? +active.endDate : null,
      lease: detail && active && active.tenant
        ? {
            id: active.id, tenant: active.tenant.name, phone: active.tenant.phone, start: +active.startDate, end: +active.endDate, billing: active.billing,
            payments: (active.payments ?? []).map((p) => ({ id: p.id, amount: p.amount, due: +p.dueDate, paid: p.paidAt ? +p.paidAt : null })).sort((x, y) => x.due - y.due),
          }
        : null,
    };
  });
}
