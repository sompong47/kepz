"use client";
import { useState } from "react";

export default function ShopTabs({
  unit,
  totalUnits,
  pendingCount,
  activeCount,
  overdueCount,
  planTab,
  leasesTab,
  unitsTab,
  settingsTab,
}: {
  unit: string;
  totalUnits: number;
  pendingCount: number;
  activeCount: number;
  overdueCount: number;
  planTab: React.ReactNode;
  leasesTab: React.ReactNode;
  unitsTab: React.ReactNode;
  settingsTab: React.ReactNode;
}) {
  const [tab, setTab] = useState<"plan" | "leases" | "units" | "settings">("plan");

  const tabs = [
    { id: "plan" as const, label: `🗺️ ผังร้าน & จัดวาง${unit}`, badge: null },
    {
      id: "leases" as const,
      label: "📋 สัญญาเช่า & การชำระเงิน",
      badge: pendingCount > 0 ? `${pendingCount} รออนุมัติ` : overdueCount > 0 ? `${overdueCount} ค้างชำระ` : activeCount > 0 ? String(activeCount) : null,
      urgent: pendingCount > 0 || overdueCount > 0,
    },
    { id: "units" as const, label: `📦 รายการ${unit}ทั้งหมด`, badge: String(totalUnits), urgent: false },
    { id: "settings" as const, label: "⚙️ ตั้งค่าร้านค้า", badge: null, urgent: false },
  ];

  return (
    <div className="space-y-4">
      {pendingCount > 0 && tab !== "leases" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-brand bg-brand/15 px-4 py-3 text-sm">
          <span>🔔 มีคำขอเช่าใหม่ <b>{pendingCount} รายการ</b> รอการอนุมัติจากคุณ</span>
          <button type="button" onClick={() => setTab("leases")} className="btn-dark !py-1.5 text-xs">
            ไปที่แท็บอนุมัติคำขอ →
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-line pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition cursor-pointer ${
              tab === t.id ? "bg-ink text-white shadow-xs" : "bg-panel border border-line text-ink2 hover:bg-panel2"
            }`}
          >
            <span>{t.label}</span>
            {t.badge && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  t.urgent ? "bg-brand text-ink" : tab === t.id ? "bg-white/20 text-white" : "bg-panel2 text-ink2"
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className={tab === "plan" ? "block" : "hidden"}>{planTab}</div>
      <div className={tab === "leases" ? "block" : "hidden"}>{leasesTab}</div>
      <div className={tab === "units" ? "block" : "hidden"}>{unitsTab}</div>
      <div className={tab === "settings" ? "block" : "hidden"}>{settingsTab}</div>
    </div>
  );
}
