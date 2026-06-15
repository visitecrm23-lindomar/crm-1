import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { publicStoreApi, PublicStore, StoreProduct, StoreCategory } from "@/lib/storeApi";
import { calculateTripDuration } from "@/lib/tripDuration";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Loader2, Search, MapPin, Calendar, Clock, ShoppingCart, Star, SlidersHorizontal, X, MessageCircle, Check, ArrowUpDown, Heart } from "lucide-react";
import { ProductQuickView } from "@/components/vitrine/ProductQuickView";
import { useFavorites } from "@/contexts/FavoritesContext";

function ProductCard({
  product,
  slug,
  primaryColor,
  accentColor,
  whatsapp,
  onQuickView,
}: {
  product: StoreProduct;
  slug: string;
  primaryColor: string;
  accentColor: string;
  whatsapp?: string | null;
  onQuickView?: (p: StoreProduct) => void;
}) {
  const [, navigate] = useLocation();
  const { addItem, openCart } = useCart();
  const { isFavorited, toggleFavorite } = useFavorites();
  const favItemType = product.tripId ? "trip" : "product";
  const favItemId = product.tripId ?? product.id;
  const isFav = isFavorited(favItemType, favItemId);
  const displayPrice = product.salePrice ?? product.price;
  const hasDiscount = !!product.salePrice;

  const isStockOut = product.trackInventory && (product.stockQuantity ?? 0) <= 0;
  const availableSeats = product.availableSeats ?? null;
  const totalCapacity = product.totalCapacity ?? null;
  const isTripSoldOut = availableSeats !== null && availableSeats <= 0;
  const isLastSeats = availableSeats !== null && availableSeats > 0 && availableSeats <= 10;
  const isOutOfStock = isStockOut || isTripSoldOut;
  const occupancyPct = totalCapacity && totalCapacity > 0 && availableSeats !== null
    ? Math.round(((totalCapacity - availableSeats) / totalCapacity) * 100)
    : null;
  const displayDate = product.tripId ? (product.departureDate ?? product.startDate) : product.startDate;
  const allInclusions = product.tripId && (product.inclusions ?? []).length > 0
    ? (product.inclusions ?? [])
    : (product.includes ?? []);
  const inclusions = allInclusions.slice(0, 3);
  const inclusionsOverflow = allInclusions.length > 3 ? allInclusions.length - 3 : 0;

  const slideImages = [
    ...(product.images ?? []),
    ...(product.gallery ?? []),
  ].slice(0, 3);
  const hasSlideshow = slideImages.length > 1;
  const [slideIndex, setSlideIndex] = useState(0);
  const [galleryReady, setGalleryReady] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    if (!hasSlideshow) return;
    const extraUrls = slideImages.slice(1);
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          let loaded = 0;
          extraUrls.forEach((src) => {
            const img = new Image();
            img.onload = img.onerror = () => {
              loaded += 1;
              if (loaded === extraUrls.length) setGalleryReady(true);
            };
            img.src = src;
          });
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasSlideshow, slideImages.join(",")]);

  function handleMouseEnter() {
    if (!hasSlideshow || isTouchDevice || !galleryReady) return;
    intervalRef.current = setInterval(() => {
      setSlideIndex((i) => (i + 1) % slideImages.length);
    }, 900);
  }

  function handleMouseLeave() {
    if (isTouchDevice) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSlideIndex(0);
  }

  const didSwipeRef = useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    didSwipeRef.current = false;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (!hasSlideshow || !galleryReady) return;
    if (Math.abs(dx) < 10) {
      didSwipeRef.current = false;
    } else if (dx < -30) {
      didSwipeRef.current = true;
      setSlideIndex((i) => (i + 1) % slideImages.length);
    } else if (dx > 30) {
      didSwipeRef.current = true;
      setSlideIndex((i) => (i - 1 + slideImages.length) % slideImages.length);
    }
  }

  function handleImageAreaClick(e: React.MouseEvent) {
    if (!isTouchDevice || !hasSlideshow || !galleryReady) return;
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    setSlideIndex((i) => (i + 1) % slideImages.length);
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function handleAdd() {
    if (isOutOfStock) return;
    addItem({
      productId: product.id,
      productName: product.name,
      unitPrice: parseFloat(displayPrice),
      image: product.images?.[0],
    });
    openCart();
  }

  function handleWhatsApp() {
    const wa = whatsapp?.replace(/\D/g, "");
    if (!wa) return;
    const text = encodeURIComponent(`Olá! Tenho interesse no pacote: ${product.name}`);
    window.open(`https://wa.me/${wa}?text=${text}`, "_blank");
  }

  function handleCardClick() {
    if (onQuickView) {
      onQuickView(product);
    } else {
      navigate(`/loja/${slug}/produtos/${product.slug}`);
    }
  }

  const visibleSlides = hasSlideshow && galleryReady ? slideImages : slideImages.slice(0, 1);

  return (
    <div
      ref={cardRef}
      className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow group cursor-pointer"
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="relative h-44 overflow-hidden bg-gradient-to-br from-blue-200 to-blue-400"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleImageAreaClick}
      >
        {slideImages.length > 0 ? (
          <>
            {visibleSlides.map((src, i) => (
              <img
                key={src}
                src={src}
                alt={product.name}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                  i === slideIndex ? "opacity-100" : "opacity-0"
                } ${i === 0 && !hasSlideshow ? "group-hover:scale-105 transition-transform duration-300" : ""}`}
              />
            ))}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">
            <MapPin className="w-12 h-12" />
          </div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-sm font-bold bg-black/60 px-3 py-1 rounded-full">Esgotado</span>
          </div>
        )}
        {isLastSeats && !isOutOfStock && (
          <span className="absolute top-2 left-2 text-xs font-bold text-white px-2 py-0.5 rounded-full bg-red-500 animate-pulse">
            Últimas vagas!
          </span>
        )}
        {hasDiscount && !isLastSeats && !isOutOfStock && (
          <span
            className="absolute top-2 left-2 text-xs font-bold text-white px-2 py-0.5 rounded-full"
            style={{ backgroundColor: accentColor }}
          >
            PROMO
          </span>
        )}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <button
            type="button"
            aria-label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            onClick={(e) => { e.stopPropagation(); toggleFavorite(favItemType, favItemId); }}
            className={`w-7 h-7 rounded-full flex items-center justify-center shadow transition-colors ${isFav ? "bg-red-500 text-white" : "bg-white/90 text-gray-400 hover:text-red-500"}`}
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-current" : ""}`} />
          </button>
          {product.isFeatured && !isOutOfStock && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ backgroundColor: "#FBBF24", color: "#78350f" }}
            >
              <Star className="w-3 h-3" /> Destaque
            </span>
          )}
        </div>
        {hasSlideshow && (
          <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 transition-opacity ${isTouchDevice ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {slideImages.map((_, i) => (
              <span
                key={i}
                role="button"
                aria-label={`Ir para imagem ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSlideIndex(i);
                }}
                className={`block rounded-full transition-all duration-300 cursor-pointer ${
                  i === slideIndex ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/60"
                }`}
                style={{ padding: "6px", margin: "-6px", boxSizing: "content-box" }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="p-3">
        <h3
          className="font-semibold text-sm mb-1 line-clamp-2 hover:underline"
        >
          {product.name}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
          {product.originCity ? (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-blue-500" />
              <span className="text-blue-600 font-medium">{product.originCity}</span>
              <span>→</span>
              <span>{product.destination}</span>
            </span>
          ) : product.destination ? (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {product.destination}
            </span>
          ) : null}
          {(() => {
            const dur = calculateTripDuration(
              product.departureDate ?? product.startDate,
              product.endDate,
              product.departureTime,
              product.returnTime,
            ) ?? (product.durationDays ? { formattedShort: `${product.durationDays}d` } : null);
            return dur ? (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {dur.formattedShort}
              </span>
            ) : null;
          })()}
          {displayDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />{" "}
              {new Date(displayDate.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
              {product.departureTime && (
                <span className="font-medium">
                  às {product.departureTime}
                  {product.returnTime && `–${product.returnTime}`}
                </span>
              )}
              {!product.departureTime && product.returnTime && (
                <span className="font-medium">volta às {product.returnTime}</span>
              )}
            </span>
          )}
        </div>
        {inclusions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {inclusions.map((inc, i) => (
              <span key={i} className="inline-flex items-center gap-0.5 text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">
                <Check className="w-2.5 h-2.5" />{inc}
              </span>
            ))}
            {inclusionsOverflow > 0 && (
              <span className="inline-flex items-center text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded-full">
                +{inclusionsOverflow}
              </span>
            )}
          </div>
        )}
        {occupancyPct !== null && totalCapacity !== null && (
          <div className="mb-1">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>{availableSeats} vaga{availableSeats !== 1 ? "s" : ""} disponível{availableSeats !== 1 ? "ais" : ""}</span>
              <span>{occupancyPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${occupancyPct >= 90 ? "bg-red-500" : occupancyPct >= 70 ? "bg-amber-500" : "bg-green-500"}`}
                style={{ width: `${occupancyPct}%` }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div>
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through mr-1">
                R$ {parseFloat(product.price).toFixed(2)}
              </span>
            )}
            <span className="font-bold" style={{ color: primaryColor }}>
              R$ {parseFloat(displayPrice).toFixed(2)}
            </span>
          </div>
          <div className="flex gap-1">
            {whatsapp && (
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 text-green-600 border-green-300 hover:bg-green-50"
                onClick={(e) => { e.stopPropagation(); handleWhatsApp(); }}
                title="Perguntar via WhatsApp"
              >
                <MessageCircle className="w-3 h-3" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleAdd(); }}
              disabled={isOutOfStock}
              style={!isOutOfStock ? { backgroundColor: primaryColor } : undefined}
              className={`h-8 px-3 ${isOutOfStock ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white"}`}
            >
              {isOutOfStock ? <span className="text-xs">Esgotado</span> : <ShoppingCart className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Filters {
  search: string;
  category: string;
  destination: string;
  type: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
}

function FilterPanel({
  filters,
  setFilters,
  categories,
  destinations,
  primaryColor,
  onClose,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  categories: StoreCategory[];
  destinations: string[];
  primaryColor: string;
  onClose?: () => void;
}) {
  const [local, setLocal] = useState<Filters>(filters);

  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  function apply() {
    setFilters(local);
    onClose?.();
  }

  function reset() {
    const empty: Filters = { search: "", category: "all", destination: "all", type: "all", minPrice: "", maxPrice: "", sort: "default" };
    setLocal(empty);
    setFilters(empty);
    onClose?.();
  }

  const hasActive =
    local.category !== "all" ||
    local.destination !== "all" ||
    local.type !== "all" ||
    !!local.minPrice ||
    !!local.maxPrice;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base">Filtros</h3>
        {hasActive && (
          <button
            onClick={reset}
            className="text-xs text-red-500 flex items-center gap-1 hover:text-red-700"
          >
            <X className="w-3 h-3" /> Limpar
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
            Categoria
          </Label>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={local.category === "all"}
                onChange={() => setLocal((p) => ({ ...p, category: "all" }))}
                className="accent-primary"
              />
              Todas
            </label>
            {categories.map((cat) => (
              <label key={cat.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={local.category === cat.id}
                  onChange={() => setLocal((p) => ({ ...p, category: cat.id }))}
                  className="accent-primary"
                />
                {cat.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
          Tipo
        </Label>
        <div className="space-y-1">
          {[
            { value: "all", label: "Todos" },
            { value: "package", label: "Pacotes" },
            { value: "tour", label: "Passeios" },
            { value: "cruise", label: "Cruzeiros" },
            { value: "hotel", label: "Hotéis" },
            { value: "service", label: "Serviços" },
          ].map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={local.type === value}
                onChange={() => setLocal((p) => ({ ...p, type: value }))}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {destinations.length > 0 && (
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
            Destino
          </Label>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={local.destination === "all"}
                onChange={() => setLocal((p) => ({ ...p, destination: "all" }))}
                className="accent-primary"
              />
              Todos
            </label>
            {destinations.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={local.destination === d}
                  onChange={() => setLocal((p) => ({ ...p, destination: d }))}
                  className="accent-primary"
                />
                {d}
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
          Faixa de Preço
        </Label>
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            placeholder="Mín"
            value={local.minPrice}
            onChange={(e) => setLocal((p) => ({ ...p, minPrice: e.target.value }))}
            className="h-8 text-sm"
          />
          <span className="text-muted-foreground text-xs">até</span>
          <Input
            type="number"
            placeholder="Máx"
            value={local.maxPrice}
            onChange={(e) => setLocal((p) => ({ ...p, maxPrice: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <Button
        onClick={apply}
        className="w-full text-white"
        style={{ backgroundColor: primaryColor }}
      >
        Aplicar Filtros
      </Button>
    </div>
  );
}

export default function VitrineCatalog({
  slug,
  store,
}: {
  slug: string;
  store: PublicStore;
}) {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialCategory = params.get("categoryId") ?? "all";
  const initialSearch = params.get("search") ?? "";

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [quickViewProduct, setQuickViewProduct] = useState<StoreProduct | null>(null);
  const LIMIT = 12;

  const [filters, setFilters] = useState<Filters>({
    search: initialSearch,
    category: initialCategory,
    destination: "all",
    type: "all",
    minPrice: "",
    maxPrice: "",
    sort: "default",
  });

  const [filtersOpen, setFiltersOpen] = useState(false);

  const [pendingOrder, setPendingOrder] = useState<{ orderNumber: string; reservationExpiresAt: string; storeSlug: string } | null>(null);
  const [pendingCountdown, setPendingCountdown] = useState<string | null>(null);
  const [pendingExpired, setPendingExpired] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("pending_order");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.storeSlug !== slug) return;
      if (new Date(parsed.reservationExpiresAt).getTime() <= Date.now()) {
        localStorage.removeItem("pending_order");
        return;
      }
      setPendingOrder(parsed);
    } catch {
      localStorage.removeItem("pending_order");
    }
  }, [slug]);

  useEffect(() => {
    if (!pendingOrder) return;
    let timer: ReturnType<typeof setInterval>;
    const tick = () => {
      const diff = new Date(pendingOrder.reservationExpiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setPendingCountdown("00:00");
        setPendingExpired(true);
        localStorage.removeItem("pending_order");
        clearInterval(timer);
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setPendingCountdown(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [pendingOrder]);

  function dismissPendingOrder() {
    setPendingOrder(null);
    setPendingCountdown(null);
    setPendingExpired(false);
    localStorage.removeItem("pending_order");
  }

  async function load() {
    setLoading(true);
    try {
      const queryParams: Record<string, string | number | boolean> = {
        page,
        limit: LIMIT,
      };
      if (filters.search) queryParams.search = filters.search;
      if (filters.category !== "all") queryParams.categoryId = filters.category;
      if (filters.destination !== "all") queryParams.destination = filters.destination;
      if (filters.type !== "all") queryParams.type = filters.type;
      if (filters.minPrice) queryParams.minPrice = filters.minPrice;
      if (filters.maxPrice) queryParams.maxPrice = filters.maxPrice;
      if (filters.sort && filters.sort !== "default") queryParams.sort = filters.sort;
      const res = await publicStoreApi.getProducts(slug, queryParams);
      setProducts(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    publicStoreApi.getCategories(slug).then(setCategories);
    publicStoreApi.getProducts(slug, { limit: 200 }).then((res) => {
      const dests = Array.from(
        new Set(res.data.map((p) => p.destination).filter(Boolean) as string[])
      ).sort();
      setDestinations(dests);
    });
  }, [slug]);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.category, filters.destination, filters.type, filters.minPrice, filters.maxPrice, filters.sort]);

  useEffect(() => {
    load();
  }, [slug, page, filters]);

  const totalPages = Math.ceil(total / LIMIT);

  const hasActiveFilters =
    filters.category !== "all" ||
    filters.destination !== "all" ||
    filters.type !== "all" ||
    !!filters.minPrice ||
    !!filters.maxPrice;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {pendingOrder && pendingCountdown !== null && !pendingExpired && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 mb-5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span className="text-sm flex-1">
            Assentos reservados para o pedido{" "}
            <strong className="font-mono">{pendingOrder.orderNumber}</strong>
            {" — "}conclua o pagamento em{" "}
            <strong className="font-mono">{pendingCountdown}</strong>
          </span>
          <button onClick={dismissPendingOrder} className="shrink-0 hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">Nossos Pacotes</h1>
        <p className="text-muted-foreground text-sm">
          {total} pacote(s) disponível(is)
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar destinos, pacotes..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        <Select
          value={filters.sort}
          onValueChange={(v) => setFilters((f) => ({ ...f, sort: v }))}
        >
          <SelectTrigger className="w-48 shrink-0">
            <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Relevância</SelectItem>
            <SelectItem value="price_asc">Menor Preço</SelectItem>
            <SelectItem value="price_desc">Maior Preço</SelectItem>
            <SelectItem value="newest">Mais Recente</SelectItem>
            <SelectItem value="popular">Mais Popular</SelectItem>
            <SelectItem value="rating">Melhor Avaliado</SelectItem>
          </SelectContent>
        </Select>

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="shrink-0 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {hasActiveFilters && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: store.primaryColor }}
                />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <FilterPanel
                filters={filters}
                setFilters={(f) => {
                  setFilters(f);
                  setFiltersOpen(false);
                }}
                categories={categories}
                destinations={destinations}
                primaryColor={store.primaryColor}
                onClose={() => setFiltersOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilters((f) => ({ ...f, category: "all" }))}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filters.category === "all"
                ? "text-white border-transparent"
                : "border-border hover:bg-muted"
            }`}
            style={filters.category === "all" ? { backgroundColor: store.primaryColor } : {}}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilters((f) => ({ ...f, category: cat.id }))}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filters.category === cat.id
                  ? "text-white border-transparent"
                  : "border-border hover:bg-muted"
              }`}
              style={
                filters.category === cat.id
                  ? { backgroundColor: store.primaryColor }
                  : {}
              }
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <MapPin className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg">Nenhum pacote encontrado.</p>
          {(filters.search || hasActiveFilters) && (
            <button
              className="mt-2 text-primary underline text-sm"
              onClick={() =>
                setFilters({ search: "", category: "all", destination: "all", type: "all", minPrice: "", maxPrice: "", sort: "default" })
              }
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                slug={slug}
                primaryColor={store.primaryColor}
                accentColor={store.accentColor}
                whatsapp={store.contactWhatsapp}
                onQuickView={setQuickViewProduct}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="flex items-center px-4 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próximo
              </Button>
            </div>
          )}
        </>
      )}

      {quickViewProduct && (
        <ProductQuickView
          product={quickViewProduct}
          store={store}
          storeSlug={slug}
          open={!!quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}
    </div>
  );
}
