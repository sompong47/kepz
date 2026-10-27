import { STATE_CLASS, STATE_LABEL, type AssetState } from "@/lib/domain";

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" | "ok" }) {
  return (
    <div className="card !p-3 sm:!p-4">
      <div className={`text-xl sm:text-2xl font-extrabold leading-tight ${tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : ""}`}>{value}</div>
      <div className="text-[11px] sm:text-xs text-muted mt-0.5">{label}</div>
    </div>
  );
}

export function StateBadge({ state }: { state: AssetState }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_CLASS[state]}`}>{STATE_LABEL[state]}</span>;
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted">
      {(Object.keys(STATE_LABEL) as AssetState[]).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <i className={`inline-block size-2.5 rounded-full ${STATE_CLASS[k].split(" ")[0]}`} />
          {STATE_LABEL[k]}
        </span>
      ))}
    </div>
  );
}
export { STATE_CLASS as STATE_CLASS_EXPORT };
