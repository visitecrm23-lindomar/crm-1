import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { PublicStore, publicStoreApi, ReferralValidation } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Gift, Tag, Users, ArrowRight, CheckCircle } from "lucide-react";

interface Props {
  slug: string;
  store: PublicStore;
}

const COOKIE_KEY = "referral_cookie_id";

function getOrCreateCookieId(): string {
  const stored = localStorage.getItem(COOKIE_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem(COOKIE_KEY, id);
  return id;
}

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    code: params.get("code") ?? params.get("ref") ?? null,
    utmSource: params.get("utm_source") ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
  };
}

export default function ReferralLanding({ slug, store }: Props) {
  const [, navigate] = useLocation();
  const [referralInfo, setReferralInfo] = useState<ReferralValidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracked, setTracked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { code, utmSource, utmMedium, utmCampaign } = getUrlParams();

  const primaryColor = store.primaryColor ?? "#6366f1";
  const secondaryColor = store.secondaryColor ?? "#4f46e5";

  const trackVisit = useCallback(async (code: string) => {
    try {
      const cookieId = getOrCreateCookieId();
      await publicStoreApi.trackReferral(slug, {
        code,
        cookieId,
        landingPage: window.location.href,
        utmSource,
        utmMedium,
        utmCampaign,
      });
      setTracked(true);
      // Persist the code in localStorage so checkout can auto-apply it
      localStorage.setItem("referral_code", code);
      localStorage.setItem("referral_cookie_id", cookieId);
    } catch {
      // Non-critical: tracking failure shouldn't block the page
    }
  }, [slug, utmSource, utmMedium, utmCampaign]);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      setError("Código de indicação não encontrado na URL.");
      return;
    }

    // Validate the code
    publicStoreApi.getReferralInfo(slug, code)
      .then((info) => {
        setReferralInfo(info);
        // Track the visit
        trackVisit(code);
      })
      .catch(() => {
        setError("Este código de indicação é inválido ou expirou.");
      })
      .finally(() => setLoading(false));
  }, [code, slug, trackVisit]);

  function goToStore() {
    navigate(`/loja/${slug}`);
  }

  function goToProducts() {
    navigate(`/loja/${slug}/produtos`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}08)` }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  if (error || !referralInfo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 py-16">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <Tag className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Código inválido</h1>
        <p className="text-muted-foreground mb-6 max-w-sm">
          {error ?? "Este código de indicação não existe ou já foi utilizado."}
        </p>
        <Button onClick={goToStore} style={{ background: primaryColor }}>
          Ver a loja mesmo assim
        </Button>
      </div>
    );
  }

  const discountPct = referralInfo.discountPercent ?? 5;
  const referrerName = referralInfo.referrerName ?? "um amigo";
  const storeHasLogo = !!store.logoUrl;

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(135deg, ${primaryColor}18, ${secondaryColor}10)` }}>
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-8">
        {/* Logo */}
        {storeHasLogo ? (
          <img src={store.logoUrl ?? ""} alt={store.name} className="h-16 mx-auto object-contain rounded-xl" />
        ) : (
          <h2 className="text-2xl font-bold" style={{ color: primaryColor }}>{store.name}</h2>
        )}

        {/* Main hero */}
        <div className="space-y-3">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-lg"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
          >
            <Gift className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Você foi indicado por <span style={{ color: primaryColor }}>{referrerName}</span>!
          </h1>
          <p className="text-muted-foreground text-lg">
            Aproveite um desconto exclusivo na sua primeira compra
          </p>
        </div>

        {/* Discount Badge */}
        <div
          className="rounded-2xl p-6 shadow-md text-white space-y-2"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
        >
          <p className="text-white/80 text-sm uppercase tracking-widest font-medium">Seu desconto exclusivo</p>
          <p className="text-6xl font-extrabold">{discountPct}%</p>
          <p className="text-white/80 text-sm">OFF em qualquer produto</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="bg-white/20 rounded-full px-4 py-1 text-sm font-mono font-bold tracking-widest">
              {code}
            </span>
            {tracked && (
              <CheckCircle className="w-5 h-5 text-white/80" />
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 space-y-4 text-left shadow-sm">
          <h3 className="font-semibold text-center">Como funciona</h3>
          <div className="space-y-3">
            {[
              { icon: Tag, text: `Seu código "${code}" já está salvo automaticamente` },
              { icon: Users, text: "Escolha seu produto favorito e finalize a compra" },
              { icon: Gift, text: `${discountPct}% de desconto aplicado automaticamente no checkout` },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: `${primaryColor}20` }}
                >
                  <span className="text-xs font-bold" style={{ color: primaryColor }}>{i + 1}</span>
                </div>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Perks */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: CheckCircle, label: "Seguro e confiável" },
            { icon: Tag, label: `${discountPct}% OFF garantido` },
            { icon: Gift, label: "Sem limites de produtos" },
          ].map(({ icon: Icon, label }, i) => (
            <div key={i} className="bg-white/50 rounded-xl p-3 text-center space-y-2">
              <Icon className="w-5 h-5 mx-auto" style={{ color: primaryColor }} />
              <p className="text-xs font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full text-white font-semibold text-base h-12 rounded-xl shadow-lg"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
            onClick={goToProducts}
          >
            Ver produtos com desconto
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={goToStore}
          >
            Explorar a loja
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {store.name} · Programa de Indicações · Desconto válido na primeira compra
        </p>
      </div>
    </div>
  );
}
