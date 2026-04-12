const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface VariantOption {
  label: string;
  price: number;
}

export interface VariantItem {
  name: string;
  options: VariantOption[];
}

async function authHeaders(): Promise<HeadersInit> {
  return { "Content-Type": "application/json" };
}

async function req<T = void>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    credentials: "include",
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as unknown as T;
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

export const storeApi = {
  getSettings: () => req<StoreSettings>("GET", "/store/settings"),
  updateSettings: (data: Partial<StoreSettings>) =>
    req<StoreSettings>("PUT", "/store/settings", data),
  initStore: (data: InitStoreInput) =>
    req<StoreSettings>("POST", "/store/init", data),

  getCategories: () => req<StoreCategory[]>("GET", "/store/categories"),
  createCategory: (data: CategoryInput) =>
    req<StoreCategory>("POST", "/store/categories", data),
  updateCategory: (id: string, data: Partial<CategoryInput>) =>
    req<StoreCategory>("PUT", `/store/categories/${id}`, data),
  deleteCategory: (id: string) =>
    req<void>("DELETE", `/store/categories/${id}`),

  getProducts: () => req<StoreProduct[]>("GET", "/store/products"),
  createProduct: (data: ProductInput) =>
    req<StoreProduct>("POST", "/store/products", data),
  updateProduct: (id: string, data: Partial<ProductInput>) =>
    req<StoreProduct>("PUT", `/store/products/${id}`, data),
  deleteProduct: (id: string) =>
    req<void>("DELETE", `/store/products/${id}`),

  getOrders: () => req<StoreOrder[]>("GET", "/store/orders"),
  getOrder: (id: string) => req<StoreOrder>("GET", `/store/orders/${id}`),
  updateOrderStatus: (
    id: string,
    status: string,
    paymentStatus?: string
  ) =>
    req<StoreOrder>("PUT", `/store/orders/${id}/status`, {
      status,
      paymentStatus,
    }),

  getCoupons: () => req<StoreCoupon[]>("GET", "/store/coupons"),
  createCoupon: (data: CouponInput) =>
    req<StoreCoupon>("POST", "/store/coupons", data),
  updateCoupon: (id: string, data: Partial<CouponInput>) =>
    req<StoreCoupon>("PUT", `/store/coupons/${id}`, data),
  deleteCoupon: (id: string) =>
    req<{ success: boolean }>("DELETE", `/store/coupons/${id}`),

  getReviews: () => req<StoreReview[]>("GET", "/store/reviews"),
  updateReviewStatus: (
    id: string,
    status: "pending" | "approved" | "rejected",
    reply?: string
  ) =>
    req<StoreReview>("PUT", `/store/reviews/${id}/status`, { status, reply }),
};

async function publicReq<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export const publicStoreApi = {
  getStore: (slug: string) =>
    publicReq<PublicStore>("GET", `/public/store/${slug}`),
  getCategories: (slug: string) =>
    publicReq<StoreCategory[]>("GET", `/public/store/${slug}/categories`),
  getProducts: (
    slug: string,
    params?: Record<string, string | number | boolean>
  ) => {
    const qs = params
      ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      : "";
    return publicReq<{
      data: StoreProduct[];
      total: number;
      page: number;
      limit: number;
    }>("GET", `/public/store/${slug}/products${qs}`);
  },
  getProduct: (slug: string, productSlug: string) =>
    publicReq<StoreProduct & { reviews: StoreReview[] }>(
      "GET",
      `/public/store/${slug}/products/${productSlug}`
    ),
  createOrder: (slug: string, data: CreateOrderInput) =>
    publicReq<StoreOrder>("POST", `/public/store/${slug}/orders`, data),
  getOrder: (slug: string, orderNumber: string) =>
    publicReq<StoreOrder>(
      "GET",
      `/public/store/${slug}/orders/${encodeURIComponent(orderNumber)}`
    ),
  validateCoupon: (
    slug: string,
    code: string,
    orderTotal: number
  ) =>
    publicReq<CouponValidation>(
      "POST",
      `/public/store/${slug}/coupons/validate`,
      { code, orderTotal }
    ),
  submitReview: (
    slug: string,
    data: {
      productId: string;
      customerName: string;
      customerEmail?: string;
      rating: number;
      comment?: string;
    }
  ) =>
    publicReq<{ success: boolean; message: string }>(
      "POST",
      `/public/store/${slug}/reviews`,
      data
    ),
  validateReferral: (slug: string, code: string) =>
    publicReq<ReferralValidation>("POST", `/public/store/${slug}/referral/validate`, { code }),
};

export interface StoreSettings {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  tagline?: string | null;
  description?: string | null;

  logo?: string | null;
  logoDark?: string | null;
  favicon?: string | null;
  bannerHome?: string | null;
  bannerMobile?: string | null;

  primaryColor: string;
  secondaryColor: string;
  accentColor: string;

  customDomain?: string | null;
  domainVerified: boolean;
  sslEnabled: boolean;

  email: string;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;

  facebookUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  youtubeUrl?: string | null;
  linkedinUrl?: string | null;
  tiktokUrl?: string | null;

  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  googleAnalyticsId?: string | null;
  facebookPixelId?: string | null;
  googleTagManagerId?: string | null;

  requireLogin: boolean;
  guestCheckout: boolean;

  paymentMethods: string[];
  stripeEnabled: boolean;
  stripePublicKey?: string | null;
  stripeSecretKey?: string | null;
  mpEnabled: boolean;
  mpPublicKey?: string | null;
  mpAccessToken?: string | null;
  pixEnabled: boolean;
  pixKey?: string | null;
  pixKeyType?: string | null;
  boletoEnabled: boolean;

  termsOfService?: string | null;
  privacyPolicy?: string | null;
  refundPolicy?: string | null;
  cancellationPolicy?: string | null;
  termsUrl?: string | null;
  privacyUrl?: string | null;

  notificationEmail?: string | null;
  orderNotificationEnabled: boolean;

  isActive: boolean;
  maintenanceMode: boolean;
  maintenanceMessage?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface PublicStore {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  contactAddress?: string | null;
  socialInstagram?: string | null;
  socialFacebook?: string | null;
  socialYoutube?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  paymentMethods: string[];
  shippingPolicy?: string | null;
  returnPolicy?: string | null;
  privacyPolicy?: string | null;
  termsOfService?: string | null;
  maintenanceMode: boolean;
  maintenanceMessage?: string | null;
}

export interface StoreCategory {
  id: string;
  storeId: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoreProduct {
  id: string;
  storeId?: string;
  categoryId?: string | null;
  tripId?: string | null;
  tripAvailableSeats?: number | null;
  tripTotalCapacity?: number | null;
  type: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  price: string;
  comparePrice?: string | null;
  costPrice?: string | null;
  onSale: boolean;
  salePrice?: string | null;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  trackInventory: boolean;
  stockQuantity?: number | null;
  allowBackorder: boolean;
  hasDates: boolean;
  startDate?: string | null;
  endDate?: string | null;
  images: string[];
  thumbnail?: string | null;
  gallery: string[];
  features: string[];
  includes: string[];
  excludes: string[];
  requirements: string[];
  destination?: string | null;
  durationDays?: number | null;
  durationNights?: number | null;
  productCity?: string | null;
  productState?: string | null;
  country?: string | null;
  hasVariants: boolean;
  variants: VariantItem[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  isFeatured: boolean;
  order: number;
  ratingAverage?: string | null;
  ratingCount: number;
  status: string;
  publishedAt?: string | null;
  viewsCount: number;
  salesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreOrder {
  id: string;
  storeId: string;
  tenantId: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  customerCpf?: string | null;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    variantLabel?: string;
  }>;
  subtotal: string;
  discountAmount: string;
  couponCode?: string | null;
  totalAmount: string;
  paymentMethod?: string | null;
  paymentStatus: string;
  paymentData?: Record<string, unknown> | null;
  notes?: string | null;
  customerNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreCoupon {
  id: string;
  storeId: string;
  code: string;
  type: string;
  value: string;
  description?: string | null;
  minPurchaseAmount?: string | null;
  maxDiscountAmount?: string | null;
  usageLimit?: number | null;
  usageLimitPerCustomer?: number | null;
  usageCount: number;
  startsAt: string;
  expiresAt: string;
  applicableProducts: string[];
  applicableCategories: string[];
  minimumItems?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoreReview {
  id: string;
  storeId: string;
  tenantId: string;
  productId: string;
  customerName: string;
  customerEmail?: string | null;
  rating: number;
  comment?: string | null;
  status: string;
  reply?: string | null;
  replyAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InitStoreInput {
  name: string;
  slug: string;
  contactEmail?: string;
  contactWhatsapp?: string;
  paymentMethods?: string[];
}

export interface CategoryInput {
  name: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  parentId?: string;
  position?: number;
  isActive?: boolean;
}

export interface ProductInput {
  name: string;
  slug?: string;
  type?: string;
  categoryId?: string;
  tripId?: string;
  shortDescription?: string;
  description?: string;
  price?: string;
  comparePrice?: string;
  costPrice?: string;
  onSale?: boolean;
  salePrice?: string;
  trackInventory?: boolean;
  stockQuantity?: number;
  allowBackorder?: boolean;
  hasDates?: boolean;
  startDate?: string;
  endDate?: string;
  images?: string[];
  thumbnail?: string;
  gallery?: string[];
  features?: string[];
  includes?: string[];
  excludes?: string[];
  requirements?: string[];
  variants?: VariantItem[];
  destination?: string;
  durationDays?: number;
  durationNights?: number;
  productCity?: string;
  productState?: string;
  country?: string;
  hasVariants?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  status?: string;
  isFeatured?: boolean;
  order?: number;
}

export interface CouponInput {
  code: string;
  type: "percentage" | "fixed" | "free_shipping";
  value: string;
  description?: string;
  minPurchaseAmount?: string;
  maxDiscountAmount?: string;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  startsAt: string;
  expiresAt: string;
  applicableProducts?: string[];
  applicableCategories?: string[];
  minimumItems?: number;
  isActive?: boolean;
}

export interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCpf?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    variantLabel?: string;
  }>;
  couponCode?: string;
  referralCode?: string;
  paymentMethod?: string;
  notes?: string;
}

export interface ReferralValidation {
  valid: boolean;
  code?: string;
  discountPercent?: number;
  description?: string;
  error?: string;
}

export interface CouponValidation {
  valid: boolean;
  code?: string;
  type?: string;
  value?: number;
  discountAmount?: number;
  error?: string;
}
