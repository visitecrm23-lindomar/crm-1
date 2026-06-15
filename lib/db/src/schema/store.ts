import { pgTable, text, timestamp, boolean, numeric, integer, json } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { tripsTable } from "./trips";
import { clientsTable } from "./clients";

export const storesTable = pgTable("stores", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().unique().references(() => tenantsTable.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  tagline: text("tagline"),
  description: text("description"),

  logo: text("logo"),
  logoDark: text("logo_dark"),
  favicon: text("favicon"),
  bannerHome: text("banner_home"),
  bannerMobile: text("banner_mobile"),

  primaryColor: text("primary_color").notNull().default("#3b82f6"),
  secondaryColor: text("secondary_color").notNull().default("#10b981"),
  accentColor: text("accent_color").notNull().default("#f59e0b"),

  customDomain: text("custom_domain").unique(),
  domainVerified: boolean("domain_verified").notNull().default(false),
  sslEnabled: boolean("ssl_enabled").notNull().default(false),

  email: text("email").notNull(),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),

  facebookUrl: text("facebook_url"),
  instagramUrl: text("instagram_url"),
  twitterUrl: text("twitter_url"),
  youtubeUrl: text("youtube_url"),
  linkedinUrl: text("linkedin_url"),
  tiktokUrl: text("tiktok_url"),

  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  metaKeywords: text("meta_keywords"),
  googleAnalyticsId: text("google_analytics_id"),
  facebookPixelId: text("facebook_pixel_id"),
  googleTagManagerId: text("google_tag_manager_id"),

  requireLogin: boolean("require_login").notNull().default(false),
  guestCheckout: boolean("guest_checkout").notNull().default(true),

  minInstallments: integer("min_installments").notNull().default(1),
  maxInstallments: integer("max_installments").notNull().default(12),
  installmentFee: numeric("installment_fee", { precision: 5, scale: 2 }).notNull().default("0"),
  minOrderValue: numeric("min_order_value", { precision: 10, scale: 2 }),

  paymentMethods: json("payment_methods").$type<string[]>().notNull().default([]),

  stripeEnabled: boolean("stripe_enabled").notNull().default(false),
  stripePublicKey: text("stripe_public_key"),
  stripeSecretKey: text("stripe_secret_key"),
  stripeWebhookSecret: text("stripe_webhook_secret"),

  mpEnabled: boolean("mp_enabled").notNull().default(false),
  mpPublicKey: text("mp_public_key"),
  mpAccessToken: text("mp_access_token"),

  pixEnabled: boolean("pix_enabled").notNull().default(false),
  pixKey: text("pix_key"),
  pixKeyType: text("pix_key_type"),

  boletoEnabled: boolean("boleto_enabled").notNull().default(false),

  termsOfService: text("terms_of_service"),
  privacyPolicy: text("privacy_policy"),
  refundPolicy: text("refund_policy"),
  cancellationPolicy: text("cancellation_policy"),
  termsUrl: text("terms_url"),
  privacyUrl: text("privacy_url"),

  notificationEmail: text("notification_email"),
  orderNotificationEnabled: boolean("order_notification_enabled").notNull().default(true),

  isActive: boolean("is_active").notNull().default(true),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),

  totalOrders: integer("total_orders").notNull().default(0),
  totalRevenue: numeric("total_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
  totalVisits: integer("total_visits").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({ createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;

export const storeCategoriesTable = pgTable("store_categories", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  icon: text("icon"),
  image: text("image"),

  parentId: text("parent_id"),

  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),

  order: integer("order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreCategorySchema = createInsertSchema(storeCategoriesTable).omit({ createdAt: true, updatedAt: true });
export type InsertStoreCategory = z.infer<typeof insertStoreCategorySchema>;
export type StoreCategory = typeof storeCategoriesTable.$inferSelect;

export const storeProductsTable = pgTable("store_products", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),

  type: text("type").notNull(),

  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull().default(""),
  shortDescription: text("short_description"),

  categoryId: text("category_id").references(() => storeCategoriesTable.id),

  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  comparePrice: numeric("compare_price", { precision: 10, scale: 2 }),
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }),

  onSale: boolean("on_sale").notNull().default(false),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
  saleStartsAt: timestamp("sale_starts_at", { withTimezone: true }),
  saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),

  trackInventory: boolean("track_inventory").notNull().default(true),
  stockQuantity: integer("stock_quantity"),
  allowBackorder: boolean("allow_backorder").notNull().default(false),

  hasDates: boolean("has_dates").notNull().default(false),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),

  images: json("images").$type<string[]>().notNull().default([]),
  thumbnail: text("thumbnail"),
  gallery: json("gallery").$type<string[]>().notNull().default([]),

  features: json("features").$type<string[]>().notNull().default([]),
  includes: json("includes").$type<string[]>().notNull().default([]),
  excludes: json("excludes").$type<string[]>().notNull().default([]),
  requirements: json("requirements").$type<string[]>().notNull().default([]),

  destination: text("destination"),
  durationDays: integer("duration_days"),
  durationNights: integer("duration_nights"),

  productCity: text("product_city"),
  productState: text("product_state"),
  country: text("country").default("Brasil"),

  hasVariants: boolean("has_variants").notNull().default(false),
  variants: json("variants").$type<Record<string, unknown>[]>().notNull().default([]),

  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  metaKeywords: text("meta_keywords"),

  tripId: text("trip_id").unique().references(() => tripsTable.id),
  partnerProductId: text("partner_product_id"),

  isFeatured: boolean("is_featured").notNull().default(false),
  order: integer("order").notNull().default(0),

  ratingAverage: numeric("rating_average", { precision: 3, scale: 2 }),
  ratingCount: integer("rating_count").notNull().default(0),

  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),

  viewsCount: integer("views_count").notNull().default(0),
  salesCount: integer("sales_count").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreProductSchema = createInsertSchema(storeProductsTable).omit({ createdAt: true, updatedAt: true });
export type InsertStoreProduct = z.infer<typeof insertStoreProductSchema>;
export type StoreProduct = typeof storeProductsTable.$inferSelect;

export const storeOrdersTable = pgTable("store_orders", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull(),

  orderNumber: text("order_number").notNull().unique(),

  clientId: text("client_id").references(() => clientsTable.id),

  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerCpf: text("customer_cpf"),
  customerAddress: json("customer_address").$type<Record<string, unknown>>(),

  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  shippingAmount: numeric("shipping_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),

  couponId: text("coupon_id"),
  couponCode: text("coupon_code"),

  paymentMethod: text("payment_method").notNull(),
  paymentProvider: text("payment_provider").notNull(),
  paymentStatus: text("payment_status").notNull().default("pending"),

  paymentIntentId: text("payment_intent_id"),
  paymentChargeId: text("payment_charge_id"),
  // One-shot token returned in the order POST response. Required by
  // /public/store/:slug/orders/:orderNumber/payment-intent so attackers who
  // only know orderNumber/email can't poison the order with a bogus
  // gateway reference. See migration 0012.
  paymentToken: text("payment_token"),

  installments: integer("installments").notNull().default(1),
  installmentAmount: numeric("installment_amount", { precision: 10, scale: 2 }),

  pixQrCode: text("pix_qr_code"),
  pixQrCodeUrl: text("pix_qr_code_url"),
  pixCopyPaste: text("pix_copy_paste"),

  boletoUrl: text("boleto_url"),
  boletoBarcode: text("boleto_barcode"),

  status: text("status").notNull().default("pending"),
  fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled"),

  customerNotes: text("customer_notes"),
  internalNotes: text("internal_notes"),

  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  paidAt: timestamp("paid_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreOrderSchema = createInsertSchema(storeOrdersTable).omit({ createdAt: true, updatedAt: true });
export type InsertStoreOrder = z.infer<typeof insertStoreOrderSchema>;
export type StoreOrder = typeof storeOrdersTable.$inferSelect;

export const storeOrderItemsTable = pgTable("store_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => storeOrdersTable.id, { onDelete: "cascade" }),

  productId: text("product_id").notNull().references(() => storeProductsTable.id),

  productName: text("product_name").notNull(),
  productType: text("product_type").notNull(),
  productImage: text("product_image"),

  variant: json("variant").$type<Record<string, unknown>>(),

  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),

  metadata: json("metadata").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStoreOrderItemSchema = createInsertSchema(storeOrderItemsTable).omit({ createdAt: true });
export type InsertStoreOrderItem = z.infer<typeof insertStoreOrderItemSchema>;
export type StoreOrderItem = typeof storeOrderItemsTable.$inferSelect;

export const storeCouponsTable = pgTable("store_coupons", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),

  code: text("code").notNull(),

  type: text("type").notNull().default("percentage"),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),

  description: text("description"),

  minPurchaseAmount: numeric("min_purchase_amount", { precision: 10, scale: 2 }),
  maxDiscountAmount: numeric("max_discount_amount", { precision: 10, scale: 2 }),

  usageLimit: integer("usage_limit"),
  usageLimitPerCustomer: integer("usage_limit_per_customer").default(1),
  usageCount: integer("usage_count").notNull().default(0),

  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

  applicableProducts: json("applicable_products").$type<string[]>().notNull().default([]),
  applicableCategories: json("applicable_categories").$type<string[]>().notNull().default([]),
  minimumItems: integer("minimum_items"),

  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreCouponSchema = createInsertSchema(storeCouponsTable).omit({ createdAt: true, updatedAt: true });
export type InsertStoreCoupon = z.infer<typeof insertStoreCouponSchema>;
export type StoreCoupon = typeof storeCouponsTable.$inferSelect;

export const storeReviewsTable = pgTable("store_reviews", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),

  productId: text("product_id").notNull().references(() => storeProductsTable.id, { onDelete: "cascade" }),

  clientId: text("client_id").references(() => clientsTable.id),

  reviewerName: text("reviewer_name").notNull(),
  reviewerEmail: text("reviewer_email").notNull(),

  rating: integer("rating").notNull(),
  title: text("title"),
  comment: text("comment"),

  images: json("images").$type<string[]>().notNull().default([]),

  verifiedPurchase: boolean("verified_purchase").notNull().default(false),

  status: text("status").notNull().default("pending"),

  isFeatured: boolean("is_featured").notNull().default(false),

  reply: text("reply"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreReviewSchema = createInsertSchema(storeReviewsTable).omit({ createdAt: true, updatedAt: true });
export type InsertStoreReview = z.infer<typeof insertStoreReviewSchema>;
export type StoreReview = typeof storeReviewsTable.$inferSelect;

export const storePagesTable = pgTable("store_pages", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),

  title: text("title").notNull(),
  slug: text("slug").notNull(),
  content: text("content").notNull().default(""),

  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),

  isPublished: boolean("is_published").notNull().default(true),
  showInMenu: boolean("show_in_menu").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStorePageSchema = createInsertSchema(storePagesTable).omit({ createdAt: true, updatedAt: true });
export type InsertStorePage = z.infer<typeof insertStorePageSchema>;
export type StorePage = typeof storePagesTable.$inferSelect;

export const storesRelations = relations(storesTable, ({ one, many }) => ({
  tenant: one(tenantsTable, { fields: [storesTable.tenantId], references: [tenantsTable.id] }),
  categories: many(storeCategoriesTable),
  products: many(storeProductsTable),
  orders: many(storeOrdersTable),
  coupons: many(storeCouponsTable),
  reviews: many(storeReviewsTable),
  pages: many(storePagesTable),
}));

export const storeCategoriesRelations = relations(storeCategoriesTable, ({ one, many }) => ({
  store: one(storesTable, { fields: [storeCategoriesTable.storeId], references: [storesTable.id] }),
  parent: one(storeCategoriesTable, { fields: [storeCategoriesTable.parentId], references: [storeCategoriesTable.id], relationName: "categoryHierarchy" }),
  children: many(storeCategoriesTable, { relationName: "categoryHierarchy" }),
  products: many(storeProductsTable),
}));

export const storeProductsRelations = relations(storeProductsTable, ({ one, many }) => ({
  store: one(storesTable, { fields: [storeProductsTable.storeId], references: [storesTable.id] }),
  category: one(storeCategoriesTable, { fields: [storeProductsTable.categoryId], references: [storeCategoriesTable.id] }),
  trip: one(tripsTable, { fields: [storeProductsTable.tripId], references: [tripsTable.id] }),
  orderItems: many(storeOrderItemsTable),
  reviews: many(storeReviewsTable),
}));

export const storeOrdersRelations = relations(storeOrdersTable, ({ one, many }) => ({
  store: one(storesTable, { fields: [storeOrdersTable.storeId], references: [storesTable.id] }),
  client: one(clientsTable, { fields: [storeOrdersTable.clientId], references: [clientsTable.id] }),
  coupon: one(storeCouponsTable, { fields: [storeOrdersTable.couponId], references: [storeCouponsTable.id] }),
  items: many(storeOrderItemsTable),
}));

export const storeOrderItemsRelations = relations(storeOrderItemsTable, ({ one }) => ({
  order: one(storeOrdersTable, { fields: [storeOrderItemsTable.orderId], references: [storeOrdersTable.id] }),
  product: one(storeProductsTable, { fields: [storeOrderItemsTable.productId], references: [storeProductsTable.id] }),
}));

export const storeCouponsRelations = relations(storeCouponsTable, ({ one, many }) => ({
  store: one(storesTable, { fields: [storeCouponsTable.storeId], references: [storesTable.id] }),
  orders: many(storeOrdersTable),
}));

export const storeReviewsRelations = relations(storeReviewsTable, ({ one }) => ({
  store: one(storesTable, { fields: [storeReviewsTable.storeId], references: [storesTable.id] }),
  product: one(storeProductsTable, { fields: [storeReviewsTable.productId], references: [storeProductsTable.id] }),
  client: one(clientsTable, { fields: [storeReviewsTable.clientId], references: [clientsTable.id] }),
}));

export const storePagesRelations = relations(storePagesTable, ({ one }) => ({
  store: one(storesTable, { fields: [storePagesTable.storeId], references: [storesTable.id] }),
}));
