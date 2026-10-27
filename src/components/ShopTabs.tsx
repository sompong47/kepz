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
    { id: "plan" as const, label: `🗺️ ผัง${unit}`, badge: null, urgent: false },
    {
      id: "leases" as const,
      label: "📋 ผู้เช่า & บิล",
      badge: pendingCount > 0 ? `${pendingCount} รอ` : overdueCount > 0 ? `${overdueCount} ค้าง` : activeCount > 0 ? String(activeCount) : null,
      urgent: pendingCount > 0 || overdueCount > 0,
    },
    { id: "units" as const, label: `📦 รายการ${unit}`, badge: String(totalUnits), urgent: false },
    { id: "settings" as const, label: "⚙️ ตั้งค่าร้าน", badge: null, urgent: false },
  ];

  return (
    <div className="space-y-3">
      {pendingCount > 0 && tab !== "leases" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand bg-brand/15 px-3 py-2 text-xs">
          <span>🔔 มีคำขอเช่าใหม่ <b>{pendingCount} รายการ</b> รอการอนุมัติ</span>
          <button type="button" onClick={() => setTab("leases")} className="btn-dark !py-1 !px-2.5 text-xs">
            ไปดูคำขอ →
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-line pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
              tab === t.id ? "bg-ink text-white shadow-2xs" : "bg-panel border border-line text-ink2 hover:bg-panel2"
            }`}
          >
            <span>{t.label}</span>
            {t.badge && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
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
