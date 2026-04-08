import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { publicStoreApi, PublicStore, StoreProduct, StoreCategory } from "@/lib/storeApi";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, MapPin, Calendar, Clock, ShoppingCart, Star } from "lucide-react";

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

  function handleAdd() {
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
        onClick={() => navigate(`/loja/${slug}/produto/${product.slug}`)}
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
        {hasDiscount && (
          <span
            className="absolute top-2 left-2 text-xs font-bold text-white px-2 py-0.5 rounded-full"
            style={{ backgroundColor: accentColor }}
          >
            PROMO
          </span>
        )}
        {product.isFeatured && (
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
          onClick={() => navigate(`/loja/${slug}/produto/${product.slug}`)}
        >
          {product.name}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
          {product.destination && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {product.destination}
            </span>
          )}
          {product.duration && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {product.duration}d
            </span>
          )}
          {product.departureDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />{" "}
              {new Date(product.departureDate + "T12:00:00").toLocaleDateString("pt-BR", {
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
            style={{ backgroundColor: primaryColor }}
            className="text-white h-8 px-3"
          >
            <ShoppingCart className="w-3 h-3" />
          </Button>
        </div>
      </div>
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 12;

  async function load() {
    setLoading(true);
    try {
      const queryParams: Record<string, string | number | boolean> = {
        page,
        limit: LIMIT,
      };
      if (search) queryParams.search = search;
      if (category !== "all") queryParams.categoryId = category;
      const res = await publicStoreApi.getProducts(slug, queryParams);
      setProducts(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    publicStoreApi.getCategories(slug).then(setCategories);
  }, [slug]);

  useEffect(() => {
    setPage(1);
  }, [search, category]);

  useEffect(() => {
    load();
  }, [slug, page, search, category]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Nossos Pacotes</h1>
        <p className="text-muted-foreground">
          {total} pacote(s) disponível(is)
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar destinos, pacotes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setCategory("all")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              category === "all"
                ? "text-white border-transparent"
                : "border-border hover:bg-muted"
            }`}
            style={
              category === "all"
                ? { backgroundColor: store.primaryColor }
                : {}
            }
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                category === cat.id
                  ? "text-white border-transparent"
                  : "border-border hover:bg-muted"
              }`}
              style={
                category === cat.id
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
          {search && (
            <button
              className="mt-2 text-primary underline text-sm"
              onClick={() => setSearch("")}
            >
              Limpar busca
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
