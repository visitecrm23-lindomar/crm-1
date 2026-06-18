import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  publicStoreApi,
  PublicStore,
  StoreProduct,
  StoreCategory,
  StoreReview,
} from "@/lib/storeApi";
import { useVitrineTheme } from "@/contexts/VitrineThemeContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/vitrine/SectionHeader";
import { PremiumProductCard } from "@/components/vitrine/PremiumProductCard";
import {
  MapPin,
  Star,
  ChevronRight,
  ArrowRight,
  Quote,
  Gift,
  X,
  ShieldCheck,
  Headphones,
  CreditCard,
  Sparkles,
  Search,
} from "lucide-react";

function ReferralWelcomeBanner({
  slug,
  primaryColor,
}: {
  slug: string;
  primaryColor: string;
}) {
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

    publicStoreApi
      .getReferralInfo(slug, refCode)
      .then((info) => {
        if (info?.referrerName) setReferrerName(info.referrerName);
        if (info) {
          const type = info.discountType ?? "percentage";
          const val =
            type === "fixed"
              ? info.discountValue ?? 0
              : info.discountPercent ?? 5;
          setDiscountLabel(
            type === "fixed"
              ? `R$ ${val.toFixed(2).replace(".", ",")}`
              : `${val}%`,
          );
        }
      })
      .catch(() => {});
  }, [slug]);

  if (!visible) return null;

  return (
    <div
      className="relative text-white px-4 py-4 flex items-center gap-3 shadow-lg"
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)`,
      }}
    >
      <Gift className="w-6 h-6 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm md:text-base">
          {referrerName
            ? `Você foi indicado por ${referrerName}! 🎉`
            : "Você chegou por indicação! 🎉"}
        </p>
        <p className="text-white/85 text-xs md:text-sm">
          Ganhe <strong>{discountLabel} de desconto</strong> na sua reserva. O
          código já está salvo para você!
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

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    title: "Reserva segura",
    desc: "Pagamento protegido e confirmação imediata",
  },
  {
    icon: Headphones,
    title: "Atendimento próximo",
    desc: "Suporte humano por WhatsApp em todas as etapas",
  },
  {
    icon: CreditCard,
    title: "Parcele sua viagem",
    desc: "Diversas formas de pagamento e parcelamento",
  },
  {
    icon: Sparkles,
    title: "Experiências selecionadas",
    desc: "Roteiros escolhidos a dedo pela nossa equipe",
  },
];

export default function VitrineHome({
  slug,
  store,
}: {
  slug: string;
  store: PublicStore;
}) {
  const [, navigate] = useLocation();
  const { colors } = useVitrineTheme();
  const [featured, setFeatured] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.allSettled([
      publicStoreApi.getProducts(slug, { featured: true, limit: 6 }),
      publicStoreApi.getCategories(slug),
      publicStoreApi.getReviews(slug, { limit: 6 }),
    ])
      .then(([p, c, r]) => {
        if (p.status === "fulfilled") setFeatured(p.value.data);
        if (c.status === "fulfilled") setCategories(c.value);
        if (r.status === "fulfilled") setReviews(r.value);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
      : null;

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    navigate(
      `/loja/${slug}/produtos${q ? `?search=${encodeURIComponent(q)}` : ""}`,
    );
  }

  return (
    <div>
      {store.referralsEnabled !== false && (
        <ReferralWelcomeBanner slug={slug} primaryColor={colors.primary} />
      )}

      {/* Hero */}
      <section className="relative overflow-hidden">
        {store.bannerUrl ? (
          <img
            src={store.bannerUrl}
            alt={store.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: colors.gradientHero }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: store.bannerUrl
              ? "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.30) 40%, rgba(0,0,0,0.65) 100%)"
              : "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.35) 100%)",
          }}
        />

        <div className="relative mx-auto flex min-h-[460px] max-w-5xl flex-col items-center justify-center px-4 py-20 text-center text-white md:min-h-[540px]">
          {store.logoUrl && (
            <img
              src={store.logoUrl}
              alt={store.name}
              className="mb-6 h-20 w-auto rounded-2xl bg-white/95 p-2 shadow-lg"
            />
          )}
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] backdrop-blur">
            <MapPin className="h-3.5 w-3.5" />
            Viagens & Excursões
          </span>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight drop-shadow-md md:text-6xl">
            {store.seoTitle ?? store.name}
          </h1>
          {store.description && (
            <p className="mt-4 max-w-2xl text-base text-white/90 drop-shadow md:text-xl">
              {store.description}
            </p>
          )}

          <form
            onSubmit={submitSearch}
            className="mt-8 flex w-full max-w-xl items-center gap-2 rounded-full bg-white/95 p-1.5 shadow-2xl backdrop-blur"
          >
            <Search className="ml-3 h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Para onde você quer viajar?"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="lg"
              className="shrink-0 rounded-full font-semibold"
              style={{
                background: colors.primary,
                color: colors.primaryForeground,
              }}
            >
              Buscar
            </Button>
          </form>

          <button
            onClick={() => navigate(`/loja/${slug}/produtos`)}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 underline-offset-4 hover:underline"
          >
            Ver todos os pacotes
            <ArrowRight className="h-4 w-4" />
          </button>

          {avgRating !== null && (
            <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm backdrop-blur">
              <span className="flex items-center gap-0.5 text-amber-300">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < Math.round(avgRating)
                        ? "fill-current"
                        : "text-white/40"
                    }`}
                  />
                ))}
              </span>
              <span className="font-semibold">{avgRating.toFixed(1)}</span>
              <span className="text-white/80">
                ({reviews.length} avaliações)
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-8 lg:grid-cols-4">
          {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: colors.primarySoft, color: colors.primary }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-14">
        {categories.length > 0 && (
          <section>
            <SectionHeader
              eyebrow="Explore"
              title="Categorias"
              subtitle="Encontre a experiência perfeita para a sua próxima viagem."
            />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() =>
                    navigate(`/loja/${slug}/produtos?categoryId=${cat.id}`)
                  }
                  className="group relative flex h-32 items-end overflow-hidden rounded-2xl border border-black/5 p-4 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                  style={
                    cat.imageUrl
                      ? undefined
                      : { background: colors.gradientHero }
                  }
                >
                  {cat.imageUrl && (
                    <>
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    </>
                  )}
                  <span className="relative flex w-full items-center justify-between font-semibold text-white">
                    {cat.name}
                    <ChevronRight className="h-4 w-4 opacity-80 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {(loading || featured.length > 0) && (
          <section>
            <SectionHeader
              eyebrow="Imperdível"
              title="Pacotes em Destaque"
              subtitle="As experiências mais procuradas, escolhidas para você."
              action={
                <Button
                  variant="ghost"
                  onClick={() => navigate(`/loja/${slug}/produtos`)}
                  className="gap-1"
                >
                  Ver todos
                  <ChevronRight className="h-4 w-4" />
                </Button>
              }
            />
            {loading ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-80 animate-pulse rounded-2xl border bg-muted"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((product) => (
                  <PremiumProductCard
                    key={product.id}
                    product={product}
                    slug={slug}
                    whatsapp={store.contactWhatsapp}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {reviews.length > 0 && (
          <section>
            <SectionHeader
              eyebrow="Depoimentos"
              title="O que dizem nossos clientes"
              subtitle="Avaliações reais de viajantes satisfeitos."
            />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <Quote
                    className="h-7 w-7 shrink-0"
                    style={{ color: colors.accent }}
                  />
                  <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                    {review.comment ?? "Excelente experiência!"}
                  </p>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          i < review.rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "fill-gray-200 text-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="mt-auto flex items-center gap-2 border-t pt-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        background: colors.primary,
                        color: colors.primaryForeground,
                      }}
                    >
                      {(review.customerName ?? "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {review.customerName ?? "Cliente"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.createdAt).toLocaleDateString("pt-BR", {
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section
          className="relative overflow-hidden rounded-3xl px-6 py-12 text-center text-white shadow-xl"
          style={{ background: colors.gradientCta }}
        >
          <h3 className="text-2xl font-bold md:text-3xl">
            Pronto para a próxima aventura?
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/90 md:text-base">
            Descubra nossos roteiros e garanta a sua vaga com facilidade e
            segurança.
          </p>
          <Button
            size="lg"
            onClick={() => navigate(`/loja/${slug}/produtos`)}
            className="mt-6 rounded-full bg-white font-bold hover:bg-white/90"
            style={{ color: colors.primary }}
          >
            Explorar pacotes
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </section>

        {store.paymentMethods.length > 0 && (
          <section className="rounded-2xl bg-muted/40 p-8 text-center">
            <h3 className="mb-3 text-lg font-bold">Formas de Pagamento</h3>
            <div className="flex flex-wrap justify-center gap-3">
              {store.paymentMethods.map((m) => (
                <Badge
                  key={m}
                  variant="secondary"
                  className="px-4 py-2 text-sm"
                >
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
