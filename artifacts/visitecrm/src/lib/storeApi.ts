const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function authHeaders(): Promise<HeadersInit> {
  return { "Content-Type": "application/json" };
}

async function req<T>(
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
  return res.json();
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
    req<{ success: boolean }>("DELETE", `/store/categories/${id}`),

  getProducts: () => req<StoreProduct[]>("GET", "/store/products"),
  createProduct: (data: ProductInput) =>
    req<StoreProduct>("POST", "/store/products", data),
  updateProduct: (id: string, data: Partial<ProductInput>) =>
    req<StoreProduct>("PUT", `/store/products/${id}`, data),
  deleteProduct: (id: string) =>
    req<{ success: boolean }>("DELETE", `/store/products/${id}`),

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
      `/public/store/${slug}/orders/${orderNumber}`
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
};

export interface StoreSettings {
  id: string;
  tenantId: string;
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
  customDomain?: string | null;
  paymentMethods: string[];
  paymentSettings: Record<string, string>;
  shippingPolicy?: string | null;
  returnPolicy?: string | null;
  privacyPolicy?: string | null;
  termsOfService?: string | null;
  isActive: boolean;
  maintenanceMode: boolean;
  maintenanceMessage?: string | null;
  notifyNewOrders: boolean;
  notifyEmail?: string | null;
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
  storeId: string;
  tenantId: string;
  categoryId?: string | null;
  tripId?: string | null;
  type: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  price: string;
  salePrice?: string | null;
  stock?: number | null;
  images: string[];
  features: string[];
  includes: string[];
  excludes: string[];
  variants: Array<{
    name: string;
    options: Array<{ label: string; price: number }>;
  }>;
  destination?: string | null;
  departureDate?: string | null;
  returnDate?: string | null;
  duration?: number | null;
  status: string;
  isPublished: boolean;
  isFeatured: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface StoreCoupon {
  id: string;
  storeId: string;
  tenantId: string;
  code: string;
  type: string;
  value: string;
  minOrderValue?: string | null;
  maxUses?: number | null;
  usedCount: number;
  applicableProductIds: string[];
  isActive: boolean;
  expiresAt?: string | null;
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
  price?: number;
  salePrice?: number;
  stock?: number;
  images?: string[];
  features?: string[];
  includes?: string[];
  excludes?: string[];
  variants?: Array<{
    name: string;
    options: Array<{ label: string; price: number }>;
  }>;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  duration?: number;
  status?: string;
  isPublished?: boolean;
  isFeatured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

export interface CouponInput {
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minOrderValue?: number;
  maxUses?: number;
  applicableProductIds?: string[];
  isActive?: boolean;
  expiresAt?: string;
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
  paymentMethod?: string;
  notes?: string;
}

export interface CouponValidation {
  valid: boolean;
  code?: string;
  type?: string;
  value?: number;
  discountAmount?: number;
  error?: string;
}
