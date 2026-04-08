import {
  pgTable,
  text,
  timestamp,
  boolean,
  json,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storesTable = pgTable("stores", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  primaryColor: text("primary_color").notNull().default("#3B82F6"),
  secondaryColor: text("secondary_color").notNull().default("#10B981"),
  accentColor: text("accent_color").notNull().default("#F59E0B"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  contactWhatsapp: text("contact_whatsapp"),
  contactAddress: text("contact_address"),
  socialInstagram: text("social_instagram"),
  socialFacebook: text("social_facebook"),
  socialYoutube: text("social_youtube"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  customDomain: text("custom_domain"),
  paymentMethods: json("payment_methods")
    .$type<string[]>()
    .notNull()
    .default([]),
  paymentSettings: json("payment_settings")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  shippingPolicy: text("shipping_policy"),
  returnPolicy: text("return_policy"),
  privacyPolicy: text("privacy_policy"),
  termsOfService: text("terms_of_service"),
  isActive: boolean("is_active").notNull().default(true),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),
  notifyNewOrders: boolean("notify_new_orders").notNull().default(true),
  notifyEmail: text("notify_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;

export const storeCategoriesTable = pgTable("store_categories", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  parentId: text("parent_id"),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertStoreCategorySchema = createInsertSchema(
  storeCategoriesTable
).omit({ createdAt: true, updatedAt: true });
export type InsertStoreCategory = z.infer<typeof insertStoreCategorySchema>;
export type StoreCategory = typeof storeCategoriesTable.$inferSelect;

export const storeProductsTable = pgTable("store_products", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  categoryId: text("category_id"),
  tripId: text("trip_id"),
  type: text("type").notNull().default("product"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  shortDescription: text("short_description"),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
  stock: integer("stock"),
  images: json("images").$type<string[]>().notNull().default([]),
  features: json("features").$type<string[]>().notNull().default([]),
  includes: json("includes").$type<string[]>().notNull().default([]),
  excludes: json("excludes").$type<string[]>().notNull().default([]),
  variants: json("variants")
    .$type<
      Array<{ name: string; options: Array<{ label: string; price: number }> }>
    >()
    .notNull()
    .default([]),
  destination: text("destination"),
  departureDate: text("departure_date"),
  returnDate: text("return_date"),
  duration: integer("duration"),
  status: text("status").notNull().default("draft"),
  isPublished: boolean("is_published").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertStoreProductSchema = createInsertSchema(
  storeProductsTable
).omit({ createdAt: true, updatedAt: true });
export type InsertStoreProduct = z.infer<typeof insertStoreProductSchema>;
export type StoreProduct = typeof storeProductsTable.$inferSelect;

export const storeOrdersTable = pgTable("store_orders", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  orderNumber: text("order_number").notNull(),
  status: text("status").notNull().default("pending"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  customerCpf: text("customer_cpf"),
  items: json("items")
    .$type<
      Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        variantLabel?: string;
      }>
    >()
    .notNull()
    .default([]),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  couponCode: text("coupon_code"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paymentData: json("payment_data").$type<Record<string, unknown>>(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertStoreOrderSchema = createInsertSchema(
  storeOrdersTable
).omit({ createdAt: true, updatedAt: true });
export type InsertStoreOrder = z.infer<typeof insertStoreOrderSchema>;
export type StoreOrder = typeof storeOrdersTable.$inferSelect;

export const storeCouponsTable = pgTable("store_coupons", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull().default("percentage"),
  value: numeric("value", { precision: 10, scale: 2 }).notNull().default("0"),
  minOrderValue: numeric("min_order_value", { precision: 10, scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  applicableProductIds: json("applicable_product_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertStoreCouponSchema = createInsertSchema(
  storeCouponsTable
).omit({ createdAt: true, updatedAt: true });
export type InsertStoreCoupon = z.infer<typeof insertStoreCouponSchema>;
export type StoreCoupon = typeof storeCouponsTable.$inferSelect;

export const storeReviewsTable = pgTable("store_reviews", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  productId: text("product_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  rating: integer("rating").notNull().default(5),
  comment: text("comment"),
  status: text("status").notNull().default("pending"),
  reply: text("reply"),
  replyAt: timestamp("reply_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertStoreReviewSchema = createInsertSchema(
  storeReviewsTable
).omit({ createdAt: true, updatedAt: true });
export type InsertStoreReview = z.infer<typeof insertStoreReviewSchema>;
export type StoreReview = typeof storeReviewsTable.$inferSelect;
