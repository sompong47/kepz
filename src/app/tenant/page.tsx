import { redirect } from "next/navigation";

/** ระบบนี้ใช้เฉพาะเจ้าของพื้นที่เช่า — หน้าผู้เช่าเดิมพาไปแดชบอร์ดเจ้าของ */
export default function Tenant() {
  redirect("/seller");
}
