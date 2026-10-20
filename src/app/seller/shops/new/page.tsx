import { requireRole } from "@/lib/auth";
import { ShopForm } from "@/components/Forms";

export default async function Page() {
  await requireRole("SELLER");
  return (<div className="space-y-4"><h1 className="text-2xl font-bold">สร้างร้านใหม่</h1><ShopForm /></div>);
}
