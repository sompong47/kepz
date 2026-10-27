import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ShopForm } from "@/components/Forms";
import { CATEGORIES, type Category } from "@/lib/domain";

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requireUser();
  const { c } = await searchParams;
  const initialCategory = c && c in CATEGORIES ? (c as Category) : undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/seller" className="text-xs text-muted hover:text-ink">← กลับหน้าผังและสถานที่ของฉัน</Link>
          <h1 className="text-lg sm:text-xl font-bold mt-0.5">✨ สร้างสถานที่และผังร้านใหม่</h1>
        </div>
      </div>
      <ShopForm initialCategory={initialCategory} />
    </div>
  );
}
