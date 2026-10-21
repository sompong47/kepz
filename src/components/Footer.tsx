import { Icon, Wordmark, type IconName } from "./Brand";

const POINTS: [IconName, string, string][] = [
  ["shield", "ปลอดภัย มั่นใจ", "ตรวจสอบตัวตนและข้อมูล"],
  ["lock", "ข้อมูลโปร่งใส", "ราคาและเงื่อนไขชัดเจน"],
  ["headset", "บริการช่วยเหลือ", "ทีมงานพร้อมดูแลคุณ"],
];

export default function Footer() {
  return (
    <footer className="mt-12 bg-brand text-ink">
      <div className="mx-auto max-w-6xl px-4 py-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 items-center">
        {POINTS.map(([icon, title, sub]) => (
          <div key={title} className="flex items-center gap-3">
            <Icon name={icon} size={32} />
            <div><div className="font-semibold">{title}</div><div className="text-sm text-ink2">{sub}</div></div>
          </div>
        ))}
        <div className="lg:text-right">
          <Wordmark size={30} onBrand />
          <div className="text-xs font-medium tracking-[0.2em] mt-1.5">YOUR SPACE, YOUR RENTAL.</div>
        </div>
      </div>
    </footer>
  );
}
