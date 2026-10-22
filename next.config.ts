import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // อัปโหลดรูปทีละไฟล์ผ่าน Server Action (ไฟล์ละไม่เกิน 5MB)
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
