import { redirect } from "next/navigation";

/** หน้าร้านสาธารณะถูกยกเลิก (ผู้เช่าไม่เข้าใช้ระบบ) — ลิงก์เดิมพาไปหน้าจัดการร้านของเจ้าของ */
export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/seller/shops/${id}`);
}
