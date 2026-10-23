"use client";
import { createContext, useContext } from "react";
import type { PayInfo } from "@/lib/domain";

/** ช่องทางรับเงินของร้านที่กำลังดู — ให้ฟอร์มจองใช้แสดงวิธีชำระ โดยไม่ต้องส่ง props ผ่านผังทุกชั้น */
const PayCtx = createContext<PayInfo | null>(null);

export function PayInfoProvider({ payment, children }: { payment: PayInfo; children: React.ReactNode }) {
  return <PayCtx.Provider value={payment}>{children}</PayCtx.Provider>;
}

export const useShopPayInfo = () => useContext(PayCtx);
