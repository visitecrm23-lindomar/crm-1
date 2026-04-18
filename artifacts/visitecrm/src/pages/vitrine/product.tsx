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
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  MessageCircle,
  Share2,
  Copy,
  Check,
  Zap,
  Search,
  X,
  Maximize2,
  Images,
  Download,
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

function Lightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [shareCopied, setShareCopied] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setImgLoaded(false);
  }, [index]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("photo", String(index + 1));
    window.history.replaceState({}, "", url.toString());
  }, [index]);

  useEffect(() => {
    return () => {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("photo");
      window.history.replaceState({}, "", cleanUrl.toString());
    };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % images.length);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [images.length, onClose]);

  function handleSharePhoto(e: React.MouseEvent) {
    e.stopPropagation();
    const shareUrl = `${window.location.href.split("?")[0]}?photo=${index + 1}`;
    if (navigator.share) {
      navigator.share({ url: shareUrl, text: `Foto ${index + 1}` }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }).catch(() => {});
    }
  }

  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    const imageUrl = images[index];
    const filename = imageUrl.split("/").pop()?.split("?")[0] ?? `foto-${index + 1}.jpg`;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10" onClick={(e) => e.stopPropagation()}>
        <p className="text-white/60 text-sm">
          {index + 1} / {images.length}
        </p>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
            onClick={handleSharePhoto}
            aria-label="Compartilhar foto"
          >
            {shareCopied ? (
              <>
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-green-400">Copiado!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>Compartilhar</span>
              </>
            )}
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
            onClick={handleDownload}
            aria-label="Baixar foto"
          >
            <Download className="w-4 h-4" />
            <span>Baixar</span>
          </button>
          <button
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {images.length > 1 && (
        <>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
            onClick={(e) => { e.stopPropagation(); setIndex((i) => (i - 1 + images.length) % images.length); }}
            aria-label="Anterior"
          >
            <PrevIcon className="w-6 h-6" />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
            onClick={(e) => { e.stopPropagation(); setIndex((i) => (i + 1) % images.length); }}
            aria-label="Próxima"
          >
            <NextIcon className="w-6 h-6" />
          </button>
        </>
      )}

      <div
        className="relative max-w-5xl max-h-[85vh] mx-4 flex flex-col items-center gap-3 mt-12"
        onClick={(e) => e.stopPropagation()}
      >
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-10 h-10 animate-spin text-white/60" />
          </div>
        )}
        <img
          key={images[index]}
          src={images[index]}
          alt={`Imagem ${index + 1}`}
          className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl transition-opacity duration-300"
          style={{ opacity: imgLoaded ? 1 : 0 }}
          onLoad={() => setImgLoaded(true)}
        />
        {images.length > 1 && (
          <div className="flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`rounded-full transition-all ${i === index ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/40 hover:bg-white/60"}`}
              />
            ))}
          </div>
        )}
        <p className="text-white/60 text-xs">
          Use ← → para navegar, Esc para fechar
        </p>
      </div>
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
  const [activeTab, setActiveTab] = useState<"descricao" | "requisitos" | "destaques">("descricao");
  const [related, setRelated] = useState<StoreProduct[]>([]);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function openLightbox(imgs: string[], idx: number) {
    setLightboxImages(imgs);
    setLightboxIndex(idx);
    setLightboxOpen(true);
  }

  useEffect(() => {
    setLoading(true);
    publicStoreApi
      .getProduct(slug, productSlug)
      .then((p) => {
        setProduct(p);
        publicStoreApi.getProducts(slug, { limit: 4 }).then((r) => {
          setRelated(r.data.filter((x) => x.id !== p.id).slice(0, 3));
        }).catch(() => {});
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, productSlug]);

  useEffect(() => {
    if (!product) return;
    const params = new URLSearchParams(window.location.search);
    const photoParam = params.get("photo");
    if (photoParam === null) return;
    const oneBased = parseInt(photoParam, 10);
    const idx = oneBased - 1;
    const allImgs = [...(product.images ?? []), ...(product.gallery ?? [])];
    if (!isNaN(idx) && idx >= 0 && idx < allImgs.length) {
      setLightboxImages(allImgs);
      setLightboxIndex(idx);
      setLightboxOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("photo");
      window.history.replaceState({}, "", url.toString());
    }
  }, [product?.id]);

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
  const images = product.images ?? [];
  const gallery = product.gallery ?? [];
  const allImages = [...images, ...gallery];
  const includes = product.includes ?? [];
  const excludes = product.excludes ?? [];
  const features = product.features ?? [];
  const requirements = product.requirements ?? [];
  const variants = product.variants ?? [];

  function handleAddToCart() {
    addItem({
      productId: product!.id,
      productName: product!.name,
      unitPrice: effectivePrice,
      quantity: qty,
      image: images[0],
      variantLabel: selectedVariant?.label,
    });
    openCart();
  }

  function handleReserveNow() {
    navigate(`/loja/${slug}/reservar/${productSlug}`);
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

  function handleShare() {
    if (!product) return;
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: product.name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  const tabs = [
    { key: "descricao" as const, label: "Descrição", show: !!product.description },
    { key: "requisitos" as const, label: "Requisitos", show: requirements.length > 0 },
    { key: "destaques" as const, label: "Destaques", show: features.length > 0 },
  ].filter((t) => t.show);

  const defaultTab = tabs[0]?.key ?? "descricao";
  const currentTab = tabs.find((t) => t.key === activeTab) ? activeTab : defaultTab;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-24">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(`/loja/${slug}/produtos`)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar ao Catálogo
        </button>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          title="Compartilhar"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-green-500">Link copiado!</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              Compartilhar
            </>
          )}
        </button>
      </div>

      {/* Full-width hero carousel */}
      <div className="relative rounded-xl overflow-hidden bg-muted h-80 mb-6">
        {images[imgIndex] ? (
          <button
            className="w-full h-full block relative group"
            onClick={() => openLightbox(allImages, imgIndex)}
            aria-label="Ampliar imagem"
          >
            <img
              src={images[imgIndex]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <Maximize2 className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </button>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MapPin className="w-20 h-20 text-muted-foreground/20" />
          </div>
        )}
        {images.length > 1 && (
          <>
            <button
              onClick={() => setImgIndex((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              <PrevIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setImgIndex((i) => (i + 1) % images.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              <NextIcon className="w-5 h-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setImgIndex(i)}
                  className={`rounded-full transition-all ${i === imgIndex ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/60 hover:bg-white/80"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setImgIndex(i)}
              className={`w-16 h-16 rounded-lg border-2 overflow-hidden shrink-0 transition-colors ${
                i === imgIndex ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Gallery grid */}
      {allImages.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Images className="w-5 h-5 text-muted-foreground" />
            Galeria de Fotos
            <span className="text-sm font-normal text-muted-foreground">({allImages.length} foto{allImages.length !== 1 ? "s" : ""})</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {allImages.map((img, i) => (
              <button
                key={i}
                onClick={() => openLightbox(allImages, i)}
                className="relative aspect-square rounded-xl overflow-hidden bg-muted group focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label={`Ver foto ${i + 1}`}
              >
                <div className="absolute inset-0 bg-muted animate-pulse" aria-hidden="true" />
                <img
                  src={img}
                  alt={`Galeria ${i + 1}`}
                  className="relative w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-0"
                  style={{ transition: "opacity 0.3s, transform 0.3s" }}
                  onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = "1"; }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero info */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline">
            {product.type === "package" ? "Pacote" : product.type === "service" ? "Serviço" : product.type === "tour" ? "Passeio" : product.type === "excursion" ? "Excursão" : "Produto"}
          </Badge>
          {product.isFeatured && (
            <Badge style={{ backgroundColor: "#FBBF24", color: "#78350F" }}>
              ★ Destaque
            </Badge>
          )}
        </div>

        <h1 className="text-3xl font-bold mb-2">{product.name}</h1>

        {product.destination && (
          <p className="text-muted-foreground flex items-center gap-1.5 mb-3">
            <MapPin className="w-4 h-4 shrink-0" />
            {product.destination}
          </p>
        )}

        {product.shortDescription && (
          <p className="text-muted-foreground leading-relaxed">{product.shortDescription}</p>
        )}
      </div>

      {/* Info grid */}
      {(product.startDate || product.departureDate || product.durationDays || product.endDate || (product.trackInventory && product.stockQuantity != null)) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(product.departureDate ?? product.startDate) && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
              <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Saída</p>
                <p className="text-xs font-semibold">
                  {new Date(
                    ((product.departureDate ?? product.startDate) as string).length <= 10
                      ? ((product.departureDate ?? product.startDate) as string) + "T12:00:00"
                      : (product.departureDate ?? product.startDate) as string
                  ).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
          )}
          {product.endDate && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
              <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Volta</p>
                <p className="text-xs font-semibold">
                  {new Date(
                    product.endDate.length <= 10 ? product.endDate + "T12:00:00" : product.endDate
                  ).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
          )}
          {product.durationDays && (
            <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-xl">
              <Clock className="w-5 h-5 text-purple-600 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Duração</p>
                <p className="text-xs font-semibold">
                  {product.durationDays} dia{product.durationDays > 1 ? "s" : ""}
                  {product.durationNights ? ` / ${product.durationNights}n` : ""}
                </p>
              </div>
            </div>
          )}
          {product.trackInventory && product.stockQuantity != null && (
            <div className={`flex items-center gap-2 p-3 rounded-xl ${product.stockQuantity <= 0 ? "bg-red-50" : product.stockQuantity <= 10 ? "bg-orange-50" : "bg-green-50"}`}>
              <span className={`text-lg shrink-0 ${product.stockQuantity <= 0 ? "text-red-600" : product.stockQuantity <= 10 ? "text-orange-600" : "text-green-600"}`}>👥</span>
              <div>
                <p className="text-[11px] text-muted-foreground">Vagas</p>
                <p className={`text-xs font-semibold ${product.stockQuantity <= 0 ? "text-red-600" : product.stockQuantity <= 10 ? "text-orange-600" : ""}`}>
                  {product.stockQuantity <= 0 ? "Esgotado" : `${product.stockQuantity} disponíveis`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Variants */}
      {variants.length > 0 && (
        <div className="mb-5 p-4 border rounded-xl bg-muted/30">
          {variants.map((v) => (
            <div key={v.name} className="mb-3 last:mb-0">
              <p className="font-medium text-sm mb-2">{v.name}</p>
              <div className="flex flex-wrap gap-2">
                {v.options.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setSelectedVariant({ variantName: v.name, label: opt.label, price: opt.price })}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                      selectedVariant?.label === opt.label
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                    {opt.price !== basePrice && <span className="ml-1 text-xs">(R$ {opt.price.toFixed(2)})</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Price */}
      <div className="flex items-center gap-3 mb-5">
        {product.salePrice && (
          <span className="text-lg text-muted-foreground line-through">
            R$ {parseFloat(product.price).toFixed(2)}
          </span>
        )}
        <span className="text-4xl font-bold" style={{ color: store.primaryColor }}>
          R$ {effectivePrice.toFixed(2)}
        </span>
        <span className="text-sm text-muted-foreground self-end mb-1">/ pessoa</span>
      </div>

      {/* In-page cart controls */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center border rounded-lg">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2 hover:bg-muted">−</button>
          <span className="px-4 py-2 font-medium">{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} className="px-3 py-2 hover:bg-muted">+</button>
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
        <div className="flex items-center gap-2 text-sm mb-4">
          <StarRating rating={Math.round(avgRating)} />
          <span className="font-medium">{avgRating.toFixed(1)}</span>
          <span className="text-muted-foreground">({product.reviews.length} avaliação(ões))</span>
        </div>
      )}

      {(includes.length > 0 || excludes.length > 0) && (
        <div className="mt-10">
          <h2 className="text-xl font-bold mb-5">O que está incluso</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {includes.length > 0 && (
              <div className="rounded-xl border p-5 bg-green-50/40">
                <h3 className="font-semibold text-green-700 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Incluído
                </h3>
                <ul className="space-y-2.5">
                  {includes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {excludes.length > 0 && (
              <div className="rounded-xl border p-5 bg-red-50/30">
                <h3 className="font-semibold text-red-700 mb-4 flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  Não incluído
                </h3>
                <ul className="space-y-2.5">
                  {excludes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

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

            {currentTab === "requisitos" && requirements.length > 0 && (
              <ul className="space-y-2">
                {requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            )}

            {currentTab === "destaques" && features.length > 0 && (
              <ul className="space-y-2">
                {features.map((f, i) => (
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

      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold mb-5">Você também pode gostar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {related.map((r) => {
              const rPrice = r.salePrice ?? r.price;
              const rDate = r.tripId ? (r.departureDate ?? r.startDate) : r.startDate;
              return (
                <a
                  key={r.id}
                  href={`/loja/${slug}/produtos/${r.slug}`}
                  className="group rounded-xl border overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                >
                  <div className="aspect-video bg-muted overflow-hidden">
                    {r.images[0] ? (
                      <img
                        src={r.images[0]}
                        alt={r.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <MapPin className="w-10 h-10 text-muted-foreground/20" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col gap-1 flex-1">
                    <p className="font-semibold text-sm line-clamp-2">{r.name}</p>
                    {r.destination && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{r.destination}
                      </p>
                    )}
                    {rDate && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(rDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </p>
                    )}
                    <p className="text-sm font-bold mt-auto" style={{ color: store.primaryColor }}>
                      R$ {parseFloat(rPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {lightboxOpen && lightboxImages.length > 0 && (
        <Lightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t shadow-lg"
        style={{ backdropFilter: "blur(8px)" }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Preço por pessoa</p>
            <div className="flex items-baseline gap-2">
              {product.salePrice && (
                <span className="text-sm text-muted-foreground line-through">
                  R$ {parseFloat(product.price).toFixed(2)}
                </span>
              )}
              <span className="text-2xl font-bold" style={{ color: store.primaryColor }}>
                R$ {effectivePrice.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              className="h-11 px-4 text-white font-semibold"
              style={{ backgroundColor: store.primaryColor }}
              onClick={handleAddToCart}
              disabled={product.trackInventory && product.stockQuantity != null && product.stockQuantity <= 0}
            >
              <ShoppingCart className="w-5 h-5" />
              <span className="hidden sm:inline ml-2">Carrinho</span>
            </Button>
            <Button
              variant="outline"
              className="h-11 px-4 font-medium flex items-center gap-2"
              onClick={() => navigate(`/loja/${slug}/consultar-pedido`)}
            >
              <Search className="w-4 h-4" />
              Consultar Pedido
            </Button>
            <Button
              className="h-11 px-6 font-bold text-white"
              style={{ backgroundColor: store.accentColor || store.primaryColor }}
              onClick={handleReserveNow}
              disabled={
                product.trackInventory && product.stockQuantity != null && product.stockQuantity <= 0
              }
            >
              <Zap className="w-5 h-5 mr-2" />
              Reservar Agora
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
