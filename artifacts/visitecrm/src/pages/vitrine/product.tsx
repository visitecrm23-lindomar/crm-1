import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { publicStoreApi, PublicStore, StoreProduct, StoreReview } from "@/lib/storeApi";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  MapPin,
  Calendar,
  Clock,
  ChevronLeft,
  Star,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  MessageCircle,
} from "lucide-react";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-4 h-4 ${
            s <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

export default function VitrineProduct({
  slug,
  productSlug,
  store,
}: {
  slug: string;
  productSlug: string;
  store: PublicStore;
}) {
  const [, navigate] = useLocation();
  const { addItem, openCart } = useCart();
  const [product, setProduct] = useState<(StoreProduct & { reviews: StoreReview[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<{ variantName: string; label: string; price: number } | null>(null);
  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState<"descricao" | "inclui" | "nao_inclui" | "requisitos" | "destaques">("descricao");

  useEffect(() => {
    setLoading(true);
    publicStoreApi
      .getProduct(slug, productSlug)
      .then((p) => setProduct(p))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, productSlug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Produto não encontrado</h2>
        <Button variant="outline" onClick={() => navigate(`/loja/${slug}/produtos`)}>
          Ver Catálogo
        </Button>
      </div>
    );
  }

  const basePrice = parseFloat(product.salePrice ?? product.price);
  const effectivePrice = selectedVariant ? selectedVariant.price : basePrice;

  function handleAddToCart() {
    addItem({
      productId: product!.id,
      productName: product!.name,
      unitPrice: effectivePrice,
      quantity: qty,
      image: product!.images[0],
      variantLabel: selectedVariant?.label,
    });
    openCart();
  }

  function handleWhatsApp() {
    const phone = store.contactWhatsapp?.replace(/\D/g, "");
    if (!phone) return;
    const variant = selectedVariant ? ` (${selectedVariant.label})` : "";
    const text = encodeURIComponent(
      `Olá! Tenho interesse no pacote *${product!.name}*${variant} — R$ ${effectivePrice.toFixed(2)}. Poderia me dar mais informações?`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener,noreferrer");
  }

  const avgRating =
    product.reviews.length > 0
      ? product.reviews.reduce((a, r) => a + r.rating, 0) / product.reviews.length
      : 0;

  const tabs = [
    { key: "descricao" as const, label: "Descrição", show: !!product.description },
    { key: "inclui" as const, label: "O que inclui", show: product.includes.length > 0 },
    { key: "nao_inclui" as const, label: "Não inclui", show: product.excludes.length > 0 },
    { key: "requisitos" as const, label: "Requisitos", show: product.requirements.length > 0 },
    { key: "destaques" as const, label: "Destaques", show: product.features.length > 0 },
  ].filter((t) => t.show);

  const defaultTab = tabs[0]?.key ?? "descricao";
  const currentTab = tabs.find((t) => t.key === activeTab) ? activeTab : defaultTab;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <button
        onClick={() => navigate(`/loja/${slug}/produtos`)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        Voltar ao Catálogo
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div>
          <div className="relative rounded-xl overflow-hidden bg-muted aspect-video">
            {product.images[imgIndex] ? (
              <img
                src={product.images[imgIndex]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <MapPin className="w-20 h-20 text-muted-foreground/20" />
              </div>
            )}
            {product.images.length > 1 && (
              <>
                <button
                  onClick={() => setImgIndex((i) => Math.max(0, i - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
                >
                  <PrevIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    setImgIndex((i) => Math.min(product.images.length - 1, i + 1))
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
                >
                  <NextIcon className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setImgIndex(i)}
                  className={`w-16 h-16 rounded border-2 overflow-hidden shrink-0 ${
                    i === imgIndex ? "border-primary" : "border-transparent"
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-start gap-2 mb-2">
            <Badge variant="outline">
              {product.type === "package"
                ? "Pacote"
                : product.type === "service"
                ? "Serviço"
                : "Produto"}
            </Badge>
            {product.isFeatured && (
              <Badge style={{ backgroundColor: store.accentColor }} className="text-white">
                ★ Destaque
              </Badge>
            )}
          </div>

          <h1 className="text-3xl font-bold mb-3">{product.name}</h1>

          {product.shortDescription && (
            <p className="text-muted-foreground mb-4">{product.shortDescription}</p>
          )}

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
            {product.destination && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {product.destination}
              </div>
            )}
            {product.durationDays && (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {product.durationDays} dia(s)
              </div>
            )}
            {product.startDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Saída:{" "}
                {new Date(product.startDate.length <= 10 ? product.startDate + "T12:00:00" : product.startDate).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            )}
            {product.endDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Volta:{" "}
                {new Date(product.endDate.length <= 10 ? product.endDate + "T12:00:00" : product.endDate).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            )}
          </div>

          {product.trackInventory && product.stockQuantity != null && product.stockQuantity <= 10 && product.stockQuantity > 0 && (
            <p className="text-sm text-orange-500 font-medium mb-3">
              ⚡ Apenas {product.stockQuantity} vagas disponíveis!
            </p>
          )}
          {product.trackInventory && product.stockQuantity != null && product.stockQuantity <= 0 && (
            <p className="text-sm text-red-500 font-medium mb-3">
              Esgotado
            </p>
          )}

          {product.variants.length > 0 && (
            <div className="mb-4">
              {product.variants.map((v) => (
                <div key={v.name} className="mb-3">
                  <p className="font-medium text-sm mb-2">{v.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {v.options.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() =>
                          setSelectedVariant({
                            variantName: v.name,
                            label: opt.label,
                            price: opt.price,
                          })
                        }
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                          selectedVariant?.label === opt.label
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                        {opt.price !== basePrice && (
                          <span className="ml-1 text-xs">
                            (R$ {opt.price.toFixed(2)})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            {product.salePrice && (
              <span className="text-lg text-muted-foreground line-through">
                R$ {parseFloat(product.price).toFixed(2)}
              </span>
            )}
            <span
              className="text-4xl font-bold"
              style={{ color: store.primaryColor }}
            >
              R$ {effectivePrice.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center border rounded-lg">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="px-3 py-2 hover:bg-muted"
              >
                −
              </button>
              <span className="px-4 py-2 font-medium">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="px-3 py-2 hover:bg-muted"
              >
                +
              </button>
            </div>
            <Button
              className="flex-1 h-11 text-white font-semibold"
              style={{ backgroundColor: store.primaryColor }}
              onClick={handleAddToCart}
              disabled={product.trackInventory && product.stockQuantity != null && product.stockQuantity <= 0}
            >
              <ShoppingCart className="w-5 h-5 mr-2" />
              Adicionar ao Carrinho
            </Button>
          </div>

          {store.contactWhatsapp && (
            <Button
              variant="outline"
              className="w-full h-11 font-semibold border-green-500 text-green-600 hover:bg-green-50 mb-4"
              onClick={handleWhatsApp}
            >
              <MessageCircle className="w-5 h-5 mr-2" />
              Comprar pelo WhatsApp
            </Button>
          )}

          {product.reviews.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <StarRating rating={Math.round(avgRating)} />
              <span className="font-medium">{avgRating.toFixed(1)}</span>
              <span className="text-muted-foreground">
                ({product.reviews.length} avaliação(ões))
              </span>
            </div>
          )}
        </div>
      </div>

      {tabs.length > 0 && (
        <div className="mt-10">
          <div className="border-b flex gap-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  currentTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="pt-6">
            {currentTab === "descricao" && product.description && (
              <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {product.description}
              </div>
            )}

            {currentTab === "inclui" && product.includes.length > 0 && (
              <ul className="space-y-2">
                {product.includes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            )}

            {currentTab === "nao_inclui" && product.excludes.length > 0 && (
              <ul className="space-y-2">
                {product.excludes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            )}

            {currentTab === "requisitos" && product.requirements.length > 0 && (
              <ul className="space-y-2">
                {product.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            )}

            {currentTab === "destaques" && product.features.length > 0 && (
              <ul className="space-y-2">
                {product.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Star className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {product.reviews.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold mb-4">Avaliações dos Clientes</h2>
          <div className="space-y-4">
            {product.reviews.map((r) => (
              <div key={r.id} className="p-4 rounded-xl border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.customerName}</span>
                    <StarRating rating={r.rating} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                {r.reply && (
                  <div className="mt-3 pl-3 border-l-2 border-primary/30">
                    <p className="text-xs font-medium text-primary mb-1">Resposta da Agência:</p>
                    <p className="text-sm text-muted-foreground">{r.reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
