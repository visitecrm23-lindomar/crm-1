import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { publicStoreApi, PublicStore, StoreProduct, StoreCategory } from "@/lib/storeApi";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Loader2, Search, MapPin, Calendar, Clock, ShoppingCart, Star, SlidersHorizontal, X } from "lucide-react";

function ProductCard({
  product,
  slug,
  primaryColor,
  accentColor,
}: {
  product: StoreProduct;
  slug: string;
  primaryColor: string;
  accentColor: string;
}) {
  const [, navigate] = useLocation();
  const { addItem, openCart } = useCart();
  const displayPrice = product.salePrice ?? product.price;
  const hasDiscount = !!product.salePrice;

  const isOutOfStock = product.trackInventory && (product.stockQuantity ?? 0) <= 0;

  function handleAdd() {
    if (isOutOfStock) return;
    addItem({
      productId: product.id,
      productName: product.name,
      unitPrice: parseFloat(displayPrice),
      image: product.images[0],
    });
    openCart();
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
      <div
        className="relative h-44 cursor-pointer overflow-hidden bg-gradient-to-br from-blue-200 to-blue-400"
        onClick={() => navigate(`/loja/${slug}/produtos/${product.slug}`)}
      >
        {product.images[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
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
        {hasDiscount && !isOutOfStock && (
          <span
            className="absolute top-2 left-2 text-xs font-bold text-white px-2 py-0.5 rounded-full"
            style={{ backgroundColor: accentColor }}
          >
            PROMO
          </span>
        )}
        {product.isFeatured && !isOutOfStock && (
          <span
            className="absolute top-2 right-2 text-xs font-bold text-white px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ backgroundColor: "#FBBF24" }}
          >
            <Star className="w-3 h-3" /> Top
          </span>
        )}
      </div>
      <div className="p-3">
        <h3
          className="font-semibold text-sm mb-1 line-clamp-2 cursor-pointer hover:underline"
          onClick={() => navigate(`/loja/${slug}/produtos/${product.slug}`)}
        >
          {product.name}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
          {product.destination && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {product.destination}
            </span>
          )}
          {product.durationDays && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {product.durationDays}d
            </span>
          )}
          {product.startDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />{" "}
              {new Date(product.startDate.length <= 10 ? product.startDate + "T12:00:00" : product.startDate).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
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
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={isOutOfStock}
            style={!isOutOfStock ? { backgroundColor: primaryColor } : undefined}
            className={`h-8 px-3 ${isOutOfStock ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white"}`}
          >
            {isOutOfStock ? <span className="text-xs">Esgotado</span> : <ShoppingCart className="w-3 h-3" />}
          </Button>
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
    const empty: Filters = { search: "", category: "all", destination: "all", type: "all", minPrice: "", maxPrice: "" };
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

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 12;

  const [filters, setFilters] = useState<Filters>({
    search: "",
    category: initialCategory,
    destination: "all",
    type: "all",
    minPrice: "",
    maxPrice: "",
  });

  const [filtersOpen, setFiltersOpen] = useState(false);

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
  }, [filters.search, filters.category, filters.destination, filters.type, filters.minPrice, filters.maxPrice]);

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
                setFilters({ search: "", category: "all", destination: "all", type: "all", minPrice: "", maxPrice: "" })
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
    </div>
  );
}
