import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { publicStoreApi, PublicStore, StoreProduct, StoreCategory, StoreReview } from "@/lib/storeApi";
import { calculateTripDuration } from "@/lib/tripDuration";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Calendar,
  Clock,
  ShoppingCart,
  Star,
  ChevronRight,
  ArrowRight,
  MessageCircle,
  Check,
  Quote,
  Gift,
  X,
} from "lucide-react";

function ReferralWelcomeBanner({ slug, primaryColor }: { slug: string; primaryColor: string }) {
  const [visible, setVisible] = useState(false);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [discountLabel, setDiscountLabel] = useState<string>("5%");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isWelcome = params.get("welcome") === "true";
    const refCode = params.get("ref");
    if (!isWelcome || !refCode) return;

    setVisible(true);

    const storedName = localStorage.getItem("referral_referrer_name");
    if (storedName) setReferrerName(storedName);

    publicStoreApi.getReferralInfo(slug, refCode).then((info) => {
      if (info?.referrerName) setReferrerName(info.referrerName);
      if (info) {
        const type = info.discountType ?? "percentage";
        const val = type === "fixed" ? (info.discountValue ?? 0) : (info.discountPercent ?? 5);
        setDiscountLabel(type === "fixed" ? `R$ ${val.toFixed(2).replace(".", ",")}` : `${val}%`);
      }
    }).catch(() => {});
  }, [slug]);

  if (!visible) return null;

  return (
    <div
      className="relative text-white px-4 py-4 flex items-center gap-3 shadow-lg"
      style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)` }}
    >
      <Gift className="w-6 h-6 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm md:text-base">
          {referrerName
            ? `Você foi indicado por ${referrerName}! 🎉`
            : "Você chegou por indicação! 🎉"}
        </p>
        <p className="text-white/85 text-xs md:text-sm">
          Ganhe <strong>{discountLabel} de desconto</strong> na sua reserva. O código já está salvo para você!
        </p>
      </div>
      <button
        onClick={() => setVisible(false)}
        className="shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors"
        aria-label="Fechar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ProductCard({
  product,
  slug,
  primaryColor,
  accentColor,
  whatsapp,
}: {
  product: StoreProduct;
  slug: string;
  primaryColor: string;
  accentColor: string;
  whatsapp?: string | null;
}) {
  const [, navigate] = useLocation();
  const { addItem, openCart } = useCart();

  const displayPrice = product.salePrice ?? product.price;
  const hasDiscount = !!product.salePrice;

  const availableSeats = product.availableSeats ?? null;
  const totalCapacity = product.totalCapacity ?? null;
  const isLastSeats = availableSeats !== null && availableSeats > 0 && availableSeats <= 10;
  const isSoldOut = availableSeats !== null && availableSeats <= 0;
  const occupancyPct = totalCapacity && totalCapacity > 0 && availableSeats !== null
    ? Math.round(((totalCapacity - availableSeats) / totalCapacity) * 100)
    : null;

  const displayDate = product.tripId ? (product.departureDate ?? product.startDate) : product.startDate;
  const allInclusions = product.tripId && (product.inclusions ?? []).length > 0
    ? (product.inclusions ?? [])
    : (product.includes ?? []);
  const inclusions = allInclusions.slice(0, 3);
  const inclusionsOverflow = allInclusions.length > 3 ? allInclusions.length - 3 : 0;

  function handleAddToCart() {
    if (isSoldOut) return;
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

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
      <div
        className="relative h-48 bg-gradient-to-br from-blue-400 to-blue-600 cursor-pointer overflow-hidden"
        onClick={() => navigate(`/loja/${slug}/produtos/${product.slug}`)}
      >
        {product.images?.[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-40">
            <MapPin className="w-16 h-16 text-white" />
          </div>
        )}
        {isSoldOut && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full">Esgotado</span>
          </div>
        )}
        {isLastSeats && !isSoldOut && (
          <div className="absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-bold text-white bg-red-500 animate-pulse">
            Últimas vagas!
          </div>
        )}
        {hasDiscount && !isLastSeats && !isSoldOut && (
          <div
            className="absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: accentColor }}
          >
            OFERTA
          </div>
        )}
        {product.isFeatured && (
          <div
            className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1"
            style={{ backgroundColor: "#FBBF24", color: "#78350f" }}
          >
            <Star className="w-3 h-3" /> Destaque
          </div>
        )}
      </div>
      <div className="p-4">
        <h3
          className="font-bold text-sm mb-1 line-clamp-2 cursor-pointer hover:underline"
          onClick={() => navigate(`/loja/${slug}/produtos/${product.slug}`)}
        >
          {product.name}
        </h3>
        {product.destination && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <MapPin className="w-3 h-3" />
            {product.destination}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {(() => {
            const dur = calculateTripDuration(
              product.departureDate ?? product.startDate,
              product.endDate,
              product.departureTime,
              product.returnTime,
            ) ?? (product.durationDays ? { formattedShort: `${product.durationDays}d` } : null);
            return dur ? (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {dur.formattedShort}
              </span>
            ) : null;
          })()}
          {displayDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(displayDate.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
              {product.departureTime && (
                <span className="font-medium">às {product.departureTime}</span>
              )}
            </span>
          )}
        </div>
        {inclusions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
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
          <div className="mb-2">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>{availableSeats} vaga{availableSeats !== 1 ? "s" : ""} disponível{availableSeats !== 1 ? "ais" : ""}</span>
              <span>{occupancyPct}% ocupado</span>
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
              <div className="text-xs text-muted-foreground line-through">
                R$ {parseFloat(product.price).toFixed(2)}
              </div>
            )}
            <div className="font-bold text-lg" style={{ color: primaryColor }}>
              R$ {parseFloat(displayPrice).toFixed(2)}
            </div>
          </div>
          <div className="flex gap-1">
            {whatsapp && (
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 text-green-600 border-green-300 hover:bg-green-50"
                onClick={handleWhatsApp}
                title="Perguntar via WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleAddToCart}
              disabled={isSoldOut}
              style={!isSoldOut ? { backgroundColor: primaryColor } : undefined}
              className={`text-white h-8 ${isSoldOut ? "bg-gray-300 cursor-not-allowed" : ""}`}
            >
              <ShoppingCart className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VitrineHome({
  slug,
  store,
}: {
  slug: string;
  store: PublicStore;
}) {
  const [, navigate] = useLocation();
  const [featured, setFeatured] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      publicStoreApi.getProducts(slug, { featured: true, limit: 6 }),
      publicStoreApi.getCategories(slug),
      publicStoreApi.getReviews(slug, { limit: 6 }),
    ]).then(([p, c, r]) => {
      if (p.status === "fulfilled") setFeatured(p.value.data);
      if (c.status === "fulfilled") setCategories(c.value);
      if (r.status === "fulfilled") setReviews(r.value);
    }).finally(() => setLoading(false));
  }, [slug]);

  return (
    <div>
      {store.referralsEnabled !== false && (
        <ReferralWelcomeBanner slug={slug} primaryColor={store.primaryColor ?? "#6366f1"} />
      )}
      {store.bannerUrl ? (
        <div className="relative h-80 md:h-[420px] overflow-hidden">
          <img
            src={store.bannerUrl}
            alt={store.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-center px-4">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 drop-shadow-lg">
              {store.seoTitle ?? store.name}
            </h1>
            {store.description && (
              <p className="text-lg md:text-xl text-white/90 max-w-2xl mb-6">
                {store.description}
              </p>
            )}
            <Button
              size="lg"
              onClick={() => navigate(`/loja/${slug}/produtos`)}
              className="text-white font-bold"
              style={{ backgroundColor: store.accentColor }}
            >
              Ver Todos os Pacotes
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="py-20 px-4 text-center text-white"
          style={{
            background: `linear-gradient(135deg, ${store.primaryColor}, ${store.secondaryColor})`,
          }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {store.seoTitle ?? store.name}
          </h1>
          {store.description && (
            <p className="text-lg text-white/90 max-w-2xl mx-auto mb-6">
              {store.description}
            </p>
          )}
          <Button
            size="lg"
            onClick={() => navigate(`/loja/${slug}/produtos`)}
            className="bg-white font-bold"
            style={{ color: store.primaryColor }}
          >
            Ver Todos os Pacotes
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-12 space-y-12">
        {categories.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Categorias</h2>
            <div className="flex gap-3 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() =>
                    navigate(`/loja/${slug}/produtos?categoryId=${cat.id}`)
                  }
                  className="px-4 py-2 rounded-full border hover:bg-muted transition-colors text-sm font-medium flex items-center gap-2"
                >
                  {cat.imageUrl && (
                    <img
                      src={cat.imageUrl}
                      alt={cat.name}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  )}
                  {cat.name}
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>
        )}

        {featured.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Pacotes em Destaque</h2>
              <Button
                variant="ghost"
                onClick={() => navigate(`/loja/${slug}/produtos`)}
                className="gap-1"
              >
                Ver todos
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl border h-64 animate-pulse bg-muted" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {featured.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    slug={slug}
                    primaryColor={store.primaryColor}
                    accentColor={store.accentColor}
                    whatsapp={store.contactWhatsapp}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {reviews.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">O que dizem nossos clientes</h2>
                <p className="text-muted-foreground text-sm mt-1">Avaliações reais de viajantes satisfeitos</p>
              </div>
              <div className="flex items-center gap-1 text-yellow-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-current" />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {reviews.map((review) => (
                <div key={review.id} className="bg-card rounded-xl border p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-2">
                    <Quote className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                      {review.comment ?? "Excelente experiência!"}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 mt-auto">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3.5 h-3.5 ${i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-200"}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: store.primaryColor }}
                    >
                      {(review.customerName ?? "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{review.customerName ?? "Cliente"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.createdAt).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {store.paymentMethods.length > 0 && (
          <section className="bg-muted/40 rounded-xl p-8 text-center">
            <h3 className="font-bold text-lg mb-3">Formas de Pagamento</h3>
            <div className="flex flex-wrap justify-center gap-3">
              {store.paymentMethods.map((m) => (
                <Badge key={m} variant="secondary" className="px-4 py-2 text-sm">
                  {m === "pix"
                    ? "PIX"
                    : m === "boleto"
                    ? "Boleto"
                    : m === "credit_card"
                    ? "Cartão de Crédito"
                    : m === "debit_card"
                    ? "Cartão de Débito"
                    : m === "transfer"
                    ? "Transferência"
                    : m}
                </Badge>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
