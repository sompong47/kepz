import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { IconBadge, LogoMark, Wordmark, type IconName } from "@/components/Brand";

export const dynamic = "force-dynamic";

/** ระบบนี้ใช้เฉพาะเจ้าของพื้นที่เช่า — ผู้เช่าไม่ต้องเข้าใช้ */
const FEATURES: [IconName, string, string][] = [
  ["search", "ผังพื้นที่ดิจิทัล", "วาดผังห้อง/ช่องจอด/แผงตลาด ดูสถานะว่าง-ไม่ว่างในภาพเดียว"],
  ["key", "บันทึกผู้เช่า & สัญญา", "ลงชื่อผู้เช่าหน้าร้าน ระบบสร้างตารางบิลตามรอบชำระให้ทันที"],
  ["lock", "รับเงิน & เก็บสลิป", "กดยืนยันรับเงินรายงวด แนบสลิป คัดลอกข้อความแจ้งชำระส่งทาง LINE"],
  ["shield", "เตือนค้างชำระ / ใกล้หมดสัญญา", "เห็นงวดเกินกำหนดและสัญญาที่ใกล้หมดก่อนใคร"],
];

export default async function Home() {
  const u = await getUser();
  if (u) redirect(u.role === "ADMIN" ? "/admin" : "/seller");
  return (
    <div className="space-y-12">
      <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr] items-center pt-4">
        <div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            ระบบจัดการพื้นที่เช่า<br />
            <span className="text-brand [-webkit-text-stroke:0.5px_#111]">สำหรับเจ้าของ</span>
          </h1>
          <div className="mt-4 h-1 w-14 rounded-full bg-brand" />
          <p className="text-ink2 mt-4 text-lg">
            ห้องเก็บของ · ที่จอดรถ · แผงตลาด · รถเช่า · เรือเช่า<br />
            ผัง สัญญา บิล และการรับเงิน จบในที่เดียว — ผู้เช่าไม่ต้องสมัครหรือติดตั้งอะไร
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/register" className="btn">เริ่มใช้งานฟรี</Link>
            <Link href="/login" className="btn-dark">เข้าสู่ระบบ</Link>
          </div>
        </div>
        <div className="hidden lg:grid place-items-center rounded-3xl bg-brand aspect-[4/3] shadow-[0_20px_40px_-20px_rgba(17,17,17,.35)]">
          <div className="text-center">
            <div className="flex justify-center"><LogoMark size={120} onBrand /></div>
            <div className="mt-6"><Wordmark size={44} onBrand tagline mark={false} /></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([icon, title, sub]) => (
          <div key={title} className="card !p-5 space-y-3">
            <IconBadge name={icon} size={48} />
            <div className="font-semibold">{title}</div>
            <div className="text-sm text-muted">{sub}</div>
          </div>
        ))}
      </section>

      <section className="card !p-6 grid gap-4 sm:grid-cols-4 text-sm">
        {["สร้างร้าน / สถานที่", "วาดผัง & ตั้งราคา", "บันทึกผู้เช่า", "ยืนยันรับเงินรายงวด"].map((t, i) => (
          <div key={t} className="flex items-center gap-3">
            <span className="grid place-items-center size-8 rounded-full bg-ink text-white font-bold shrink-0">{i + 1}</span>
            <span className="font-medium">{t}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
