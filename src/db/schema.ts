import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date());

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  password: text("password").notNull(),
  role: text("role", { enum: ["TENANT", "SELLER", "ADMIN"] }).notNull(),
  createdAt: createdAt(),
});

export const shops = sqliteTable("shops", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category", { enum: ["STORAGE", "PARKING", "STALL", "CAR", "BOAT"] }).notNull(),
  location: text("location"),
  mapUrl: text("map_url"),
  coverPhoto: text("cover_photo"),
  phone: text("phone"),
  active: integer("active", { mode: "boolean" }).notNull().default(true), // แอดมินระงับได้
  published: integer("published", { mode: "boolean" }).notNull().default(false), // เจ้าของเปิดร้านให้เช่าแล้ว
  ownerId: text("owner_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const assets = sqliteTable(
  "assets",
  {
    id: id(),
    code: text("code").notNull(),
    size: text("size"),
    price: integer("price").notNull(),
    period: text("period", { enum: ["DAY", "MONTH"] }).notNull().default("MONTH"),
    note: text("note"),
    x: integer("x"),
    y: integer("y"),
    w: integer("w"),
    h: integer("h"),
    shape: text("shape", { enum: ["RECT", "CIRCLE"] }).notNull().default("RECT"),
    rot: integer("rot").notNull().default(0), // องศา หมุนรอบจุดกึ่งกลาง
    listed: integer("listed", { mode: "boolean" }).notNull().default(false), // เปิดให้เช่า (ต้องมีราคา)
    floorId: text("floor_id").references(() => floors.id, { onDelete: "set null" }),
    shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("assets_shop_code").on(t.shopId, t.code)],
);

/** รูปของห้อง/ช่อง ไฟล์อยู่ใน uploads/ */
export const assetPhotos = sqliteTable("asset_photos", {
  id: id(),
  file: text("file").notNull(),
  mime: text("mime").notNull(),
  assetId: text("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

/** ชั้น/โซนของผัง แต่ละชั้นมีขนาดพื้นที่ของตัวเอง */
export const floors = sqliteTable("floors", {
  id: id(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
  w: integer("w").notNull().default(1000),
  h: integer("h").notNull().default(600),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
});

/** องค์ประกอบผังที่ไม่ได้ให้เช่า เช่น ผนัง ทางเดิน ทางเข้า */
export const features = sqliteTable("features", {
  id: id(),
  kind: text("kind", { enum: ["ZONE", "ROAD", "WALL", "ENTRANCE", "STAIRS", "TOILET", "OFFICE", "TEXT", "WATER", "GREEN"] }).notNull(),
  label: text("label"),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  w: integer("w").notNull(),
  h: integer("h").notNull(),
  rot: integer("rot").notNull().default(0),
  color: text("color"), // #rrggbb; null = สีตั้งต้นของชนิด
  floorId: text("floor_id").notNull().references(() => floors.id, { onDelete: "cascade" }),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
});

export const leases = sqliteTable("leases", {
  id: id(),
  status: text("status", { enum: ["PENDING", "ACTIVE", "REJECTED", "ENDED"] }).notNull().default("PENDING"),
  startDate: integer("start_date", { mode: "timestamp_ms" }).notNull(),
  endDate: integer("end_date", { mode: "timestamp_ms" }).notNull(),
  billing: text("billing", { enum: ["MONTH", "HALF_YEAR", "YEAR"] }).notNull().default("MONTH"),
  assetId: text("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => users.id),
  guestName: text("guest_name"),
  guestPhone: text("guest_phone"),
  createdAt: createdAt(),
});

export const payments = sqliteTable("payments", {
  id: id(),
  amount: integer("amount").notNull(),
  dueDate: integer("due_date", { mode: "timestamp_ms" }).notNull(),
  paidAt: integer("paid_at", { mode: "timestamp_ms" }),
  leaseId: text("lease_id").notNull().references(() => leases.id, { onDelete: "cascade" }),
});

export const shopRelations = relations(shops, ({ one, many }) => ({
  owner: one(users, { fields: [shops.ownerId], references: [users.id] }),
  assets: many(assets),
  floors: many(floors),
  features: many(features),
}));
export const floorRelations = relations(floors, ({ one, many }) => ({
  shop: one(shops, { fields: [floors.shopId], references: [shops.id] }),
  assets: many(assets),
  features: many(features),
}));
export const featureRelations = relations(features, ({ one }) => ({
  floor: one(floors, { fields: [features.floorId], references: [floors.id] }),
  shop: one(shops, { fields: [features.shopId], references: [shops.id] }),
}));
export const assetRelations = relations(assets, ({ one, many }) => ({
  shop: one(shops, { fields: [assets.shopId], references: [shops.id] }),
  floor: one(floors, { fields: [assets.floorId], references: [floors.id] }),
  leases: many(leases),
  photos: many(assetPhotos),
}));
export const assetPhotoRelations = relations(assetPhotos, ({ one }) => ({
  asset: one(assets, { fields: [assetPhotos.assetId], references: [assets.id] }),
}));
export const leaseRelations = relations(leases, ({ one, many }) => ({
  asset: one(assets, { fields: [leases.assetId], references: [assets.id] }),
  tenant: one(users, { fields: [leases.tenantId], references: [users.id] }),
  payments: many(payments),
}));
export const paymentRelations = relations(payments, ({ one }) => ({
  lease: one(leases, { fields: [payments.leaseId], references: [leases.id] }),
}));
