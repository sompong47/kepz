import { STATE_CLASS, STATE_LABEL, type AssetState } from "@/lib/domain";

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" | "ok" }) {
  return (
    <div className="card !p-4">
      <div className={`text-3xl font-bold ${tone === "warn" ? "text-amber-400" : tone === "ok" ? "text-emerald-400" : ""}`}>{value}</div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
    </div>
  );
}

export function StateBadge({ state }: { state: AssetState }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLASS[state]}`}>{STATE_LABEL[state]}</span>;
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-400">
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
