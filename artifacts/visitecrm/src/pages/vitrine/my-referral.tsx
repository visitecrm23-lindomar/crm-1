import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { clientPortalApi, type ClientPortalProfile } from "@/lib/clientPortalApi";
import { PublicStore } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ROLES } from "@workspace/permissions";
import {
  Loader2,
  Copy,
  Check,
  Share2,
  Gift,
  Users,
  TrendingUp,
  MessageCircle,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

interface Props {
  slug: string;
  store: PublicStore;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  bronze: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  silver: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
  gold:   { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  platinum: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
};

function formatCurrency(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MyReferralPage({ slug, store }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isSignedIn, isLoaded } = useUser();
  const { data: me, isLoading: meLoading } = useGetMe();

  const [profile, setProfile] = useState<ClientPortalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      navigate(`/loja/${slug}/entrar?redirect=/loja/${slug}/minhas-indicacoes`);
      return;
    }
    if (meLoading) return;
    if (me && me.role !== ROLES.CLIENT) {
      navigate(`/loja/${slug}`);
    }
  }, [isLoaded, isSignedIn, me?.role, meLoading, slug, navigate]);

  useEffect(() => {
    if (!isSignedIn || meLoading || (me && me.role !== ROLES.CLIENT)) return;
    clientPortalApi
      .getProfile()
      .then(setProfile)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [isSignedIn, meLoading, me?.role]);

  const referralCode = profile?.referral?.code ?? null;
  const primaryColor = store.primaryColor ?? "#6366f1";
  const secondaryColor = store.secondaryColor ?? "#4f46e5";

  const shareLink = referralCode
    ? `${window.location.origin}/loja/${slug}/indicacao?code=${encodeURIComponent(referralCode)}`
    : null;

  const handleCopyCode = useCallback(async () => {
    if (!referralCode) return;
    await navigator.clipboard.writeText(referralCode);
    setCodeCopied(true);
    toast({ title: "Código copiado!", description: "Cole no chat ou compartilhe com amigos." });
    setTimeout(() => setCodeCopied(false), 2500);
  }, [referralCode, toast]);

  const handleCopyLink = useCallback(async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setLinkCopied(true);
    toast({ title: "Link copiado!", description: "Compartilhe com amigos para ganhar bônus." });
    setTimeout(() => setLinkCopied(false), 2500);
  }, [shareLink, toast]);

  const handleShareWhatsApp = useCallback(() => {
    if (!shareLink) return;
    const shareMessage = profile?.referral?.shareMessage;
    const message = shareMessage
      ? `${shareMessage}\n\n${shareLink}`
      : `Olá! Você foi indicado(a) por mim para conhecer ${store.name}. Use meu link exclusivo para aproveitar condições especiais: ${shareLink}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }, [shareLink, profile?.referral?.shareMessage, store.name]);

  const handleNativeShare = useCallback(async () => {
    if (!shareLink || !navigator.share) return;
    try {
      await navigator.share({
        title: `Indicação — ${store.name}`,
        text: `Use meu código ${referralCode} para aproveitar condições especiais em ${store.name}!`,
        url: shareLink,
      });
    } catch {
      // dismissed by user
    }
  }, [shareLink, referralCode, store.name]);

  if (!isLoaded || meLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-16 gap-4">
        <Gift className="w-14 h-14 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">Não foi possível carregar</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Ocorreu um erro ao carregar suas informações de indicação. Verifique sua conexão e tente novamente.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Tentar novamente
          </Button>
          <Button variant="ghost" onClick={() => navigate(`/loja/${slug}`)}>
            Voltar à loja
          </Button>
        </div>
      </div>
    );
  }

  if (!profile || !referralCode) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-16 gap-4">
        <Gift className="w-14 h-14 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">Programa de indicações</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Seu código de indicação ainda não foi gerado. Entre em contato com a agência para mais informações.
        </p>
        <Button variant="outline" onClick={() => navigate(`/loja/${slug}`)}>
          Voltar à loja
        </Button>
      </div>
    );
  }

  const ref = profile.referral;
  const tierColors = TIER_COLORS[ref.currentTierLevel] ?? TIER_COLORS.bronze;

  const stats = [
    {
      icon: <Users className="w-5 h-5" />,
      label: "Total de indicações",
      value: ref.totalReferrals,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      icon: <Check className="w-5 h-5" />,
      label: "Confirmadas",
      value: ref.completedReferrals,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      icon: <TrendingUp className="w-5 h-5" />,
      label: "Bônus acumulado",
      value: formatCurrency(ref.totalEarnings),
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      {/* Header */}
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Minhas Indicações</h1>
            <p className="text-white/80 text-xs">Indique amigos e ganhe bônus</p>
          </div>
        </div>

        {/* Tier badge */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-white/70 text-xs">Nível atual:</span>
          <span className="bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            {ref.currentTierLabel}
          </span>
          {ref.nextTierLabel && ref.nextTierMin !== null && (
            <span className="text-white/60 text-xs">
              · {ref.nextTierMin - ref.completedReferrals} para {ref.nextTierLabel}
            </span>
          )}
        </div>

        {/* Tier progress */}
        {ref.nextTierMin !== null && ref.tierProgress < 100 && (
          <div className="mt-3">
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${Math.min(ref.tierProgress, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="text-center">
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg ${s.bg} ${s.color} flex items-center justify-center mx-auto mb-2`}>
                {s.icon}
              </div>
              <p className="text-lg font-bold leading-tight">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Referral code card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Seu código de indicação
          </CardTitle>
          <CardDescription>
            Compartilhe este código com amigos. Quando eles comprarem, você ganha bônus!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Code display */}
          <div
            className="flex items-center justify-between rounded-xl p-4 border-2"
            style={{ borderColor: `${primaryColor}40`, background: `${primaryColor}08` }}
          >
            <span
              className="text-2xl font-mono font-extrabold tracking-widest"
              style={{ color: primaryColor }}
            >
              {referralCode}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={handleCopyCode}
            >
              {codeCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-500" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copiar código
                </>
              )}
            </Button>
          </div>

          {/* Share link */}
          {shareLink && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate flex-1">{shareLink}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 shrink-0"
                onClick={handleCopyLink}
              >
                {linkCopied ? (
                  <Check className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {linkCopied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          )}

          {/* Share buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              className="flex-1 gap-2 text-white"
              style={{ background: "#25D366" }}
              onClick={handleShareWhatsApp}
            >
              <MessageCircle className="w-4 h-4" />
              Compartilhar no WhatsApp
            </Button>

            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleNativeShare}
              >
                <Share2 className="w-4 h-4" />
                Mais opções
              </Button>
            )}

            {!(typeof navigator !== "undefined" && "share" in navigator) && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleCopyLink}
              >
                <Copy className="w-4 h-4" />
                {linkCopied ? "Link copiado!" : "Copiar link"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { step: "1", text: "Compartilhe seu código ou link com amigos" },
            { step: "2", text: "Seu amigo acessa a loja e faz uma compra usando seu código" },
            { step: "3", text: "Você recebe um bônus quando a reserva for confirmada" },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
                style={{ background: primaryColor }}
              >
                {step}
              </div>
              <p className="text-sm text-muted-foreground pt-0.5">{text}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tier info */}
      <Card className={`border ${tierColors.border} ${tierColors.bg}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className={`w-4 h-4 ${tierColors.text}`} />
                <span className={`text-sm font-semibold ${tierColors.text}`}>
                  Nível {ref.currentTierLabel}
                </span>
                <Badge variant="outline" className={`text-xs ${tierColors.text} ${tierColors.border}`}>
                  {ref.currentTierMultiplier}× bônus
                </Badge>
              </div>
              {ref.nextTierLabel && ref.nextTierMin !== null ? (
                <p className="text-xs text-muted-foreground">
                  Indique mais {ref.nextTierMin - ref.completedReferrals} pessoa{ref.nextTierMin - ref.completedReferrals !== 1 ? "s" : ""} para alcançar o nível {ref.nextTierLabel}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Você está no nível máximo!</p>
              )}
            </div>
            <ChevronRight className={`w-4 h-4 ${tierColors.text} opacity-50`} />
          </div>
        </CardContent>
      </Card>

      {/* Back link */}
      <div className="text-center">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/perfil?tab=indicacoes`)}>
          Ver histórico completo no meu perfil
          <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
