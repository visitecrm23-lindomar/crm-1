import { useState, useEffect, useCallback, type ReactElement } from "react";
import { useLocation, useSearch } from "wouter";
import { useUser } from "@clerk/react";
import { useGetMe, useGetActiveCampaign } from "@workspace/api-client-react";
import { clientPortalApi, type ClientPortalProfile, type ClientReferral } from "@/lib/clientPortalApi";
import { PublicStore } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ROLES } from "@workspace/permissions";
import QRCode from "qrcode";
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
  Clock,
  CheckCircle,
  XCircle,
  QrCode,
  Coins,
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

const REFERRAL_STATUS_MAP: Record<string, { label: string; color: string; icon: ReactElement | null }> = {
  pending:   { label: "Pendente",   color: "bg-yellow-100 text-yellow-800",  icon: <Clock className="w-3.5 h-3.5" /> },
  completed: { label: "Confirmada", color: "bg-green-100 text-green-800",    icon: <CheckCircle className="w-3.5 h-3.5" /> },
  converted: { label: "Convertida", color: "bg-blue-100 text-blue-800",      icon: <CheckCircle className="w-3.5 h-3.5" /> },
  expired:   { label: "Expirada",   color: "bg-slate-100 text-slate-500",    icon: <XCircle className="w-3.5 h-3.5" /> },
  reversed:  { label: "Revertida",  color: "bg-red-100 text-red-700",        icon: <XCircle className="w-3.5 h-3.5" /> },
};

function ReferralStatusBadge({ status }: { status: string }) {
  const cfg = REFERRAL_STATUS_MAP[status] ?? { label: status, color: "bg-slate-100 text-slate-600", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function maskName(name: string | null): string {
  if (!name) return "Pessoa indicada";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1, 3)}***`;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function maskEmail(email: string | null): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

function ReferralHistoryRow({ r, primaryColor }: { r: ClientReferral; primaryColor: string }) {
  const displayName = r.referredName ? maskName(r.referredName) : (r.referredEmail ? maskEmail(r.referredEmail) : "Pessoa indicada");
  const dateLabel = (r.status === "completed" || r.status === "converted") && r.convertedAt
    ? `Convertida em ${new Date(r.convertedAt).toLocaleDateString("pt-BR")}`
    : r.status === "expired" && r.expiresAt
    ? `Expirou em ${new Date(r.expiresAt).toLocaleDateString("pt-BR")}`
    : `Indicada em ${new Date(r.createdAt).toLocaleDateString("pt-BR")}`;

  const bonusValue = parseFloat(r.bonusAmount);

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold mt-0.5"
        style={{ background: `${primaryColor}22`, color: primaryColor }}
      >
        {displayName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{displayName}</span>
          <ReferralStatusBadge status={r.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
        {r.status === "reversed" && bonusValue > 0 && (
          <p className="text-xs mt-1 font-medium text-red-500">
            ✕ Bônus de {bonusValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} revertido
          </p>
        )}
        {(r.status === "completed" || r.status === "converted") && bonusValue > 0 && (
          <p className={`text-xs mt-1 font-medium ${
            r.bonusCreditUsedAt
              ? "text-purple-600"
              : r.bonusPaid
              ? "text-green-600"
              : "text-orange-500"
          }`}>
            {r.bonusCreditUsedAt
              ? (() => {
                  const usedAmt = r.bonusCreditUsedAmount ? parseFloat(r.bonusCreditUsedAmount) : bonusValue;
                  return `✓ Crédito de ${usedAmt.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} usado no checkout`;
                })()
              : r.bonusPaid
              ? `✓ Bônus de ${bonusValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} pago`
              : `⏳ Bônus de ${bonusValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} aguardando pagamento`}
          </p>
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 5;

function safeQrDarkColor(hex: string, fallback = "#111827"): string {
  const m = hex.replace("#", "").match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return fallback;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35 ? fallback : hex;
}

function formatCurrency(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const VALID_STATUS_FILTERS = ["all", "pending", "confirmed", "expired", "reversed"] as const;
type StatusFilter = (typeof VALID_STATUS_FILTERS)[number];

function parseStatusFilter(value: string | null): StatusFilter {
  if (value && (VALID_STATUS_FILTERS as readonly string[]).includes(value)) {
    return value as StatusFilter;
  }
  return "all";
}

export default function MyReferralPage({ slug, store }: Props) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { isSignedIn, isLoaded } = useUser();
  const { data: me, isLoading: meLoading } = useGetMe();

  const [profile, setProfile] = useState<ClientPortalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [referrals, setReferrals] = useState<ClientReferral[] | null>(null);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    parseStatusFilter(new URLSearchParams(search).get("status"))
  );
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const { data: activeCampaign } = useGetActiveCampaign();
  const [countdown, setCountdown] = useState<string>("");

  useEffect(() => {
    if (!activeCampaign) { setCountdown(""); return; }
    function calc() {
      const diff = new Date(activeCampaign!.endsAt).getTime() - Date.now();
      if (diff <= 0) { setCountdown(""); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(d > 0 ? `${d}d ${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m` : `${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`);
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [activeCampaign]);

  useEffect(() => {
    const incoming = parseStatusFilter(new URLSearchParams(search).get("status"));
    setStatusFilter(incoming);
  }, [search]);

  useEffect(() => {
    if (store.referralsEnabled === false) {
      navigate(`/loja/${slug}`);
      return;
    }
    if (!isLoaded) return;
    if (!isSignedIn) {
      navigate(`/loja/${slug}/entrar?redirect=/loja/${slug}/minhas-indicacoes`);
      return;
    }
    if (meLoading) return;
    if (me && me.role !== ROLES.CLIENT) {
      navigate(`/loja/${slug}`);
    }
  }, [isLoaded, isSignedIn, me?.role, meLoading, slug, navigate, store.referralsEnabled]);

  useEffect(() => {
    if (!isSignedIn || meLoading || (me && me.role !== ROLES.CLIENT)) return;
    clientPortalApi
      .getProfile()
      .then(setProfile)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [isSignedIn, meLoading, me?.role]);

  useEffect(() => {
    if (!isSignedIn || meLoading || (me && me.role !== ROLES.CLIENT)) return;
    setLoadingReferrals(true);
    clientPortalApi
      .getMyReferrals()
      .then((r) => {
        const sorted = [...r.data].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setReferrals(sorted);
      })
      .catch(() => setReferrals([]))
      .finally(() => setLoadingReferrals(false));
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

  const handleShowQR = useCallback(async () => {
    if (!shareLink || !referralCode) return;
    setQrLoading(true);
    try {
      const canvas = document.createElement("canvas");
      await QRCode.toCanvas(canvas, shareLink, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: "H",
        color: {
          dark: safeQrDarkColor(primaryColor),
          light: "#FFFFFF",
        },
      });

      if (store.logoUrl) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(); return; }
            const logoSize = Math.round(canvas.width * 0.22);
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const halo = logoSize / 2 + 8;
            ctx.fillStyle = "#FFFFFF";
            ctx.beginPath();
            ctx.arc(cx, cy, halo, 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(img, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = store.logoUrl!;
        });
      }

      setQrPreviewUrl(canvas.toDataURL("image/png"));
    } catch {
      toast({ title: "Erro ao gerar QR Code", description: "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setQrLoading(false);
    }
  }, [shareLink, referralCode, primaryColor, store.logoUrl, toast]);

  const handleDownloadQR = useCallback(() => {
    if (!qrPreviewUrl || !referralCode) return;
    const anchor = document.createElement("a");
    anchor.href = qrPreviewUrl;
    anchor.download = `qrcode-indicacao-${referralCode}.png`;
    anchor.click();
  }, [qrPreviewUrl, referralCode]);

  const handleShareQR = useCallback(async () => {
    if (!qrPreviewUrl || !referralCode) return;
    try {
      const res = await fetch(qrPreviewUrl);
      const blob = await res.blob();
      const file = new File([blob], `qrcode-indicacao-${referralCode}.png`, { type: "image/png" });
      if (!navigator.canShare || !navigator.canShare({ files: [file] })) return;
      await navigator.share({ title: "QR Code de indicação", files: [file] });
    } catch {
      // dismissed by user
    }
  }, [qrPreviewUrl, referralCode]);

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

  const filteredReferrals = (referrals ?? []).filter((r) => {
    if (statusFilter === "pending") return r.status === "pending";
    if (statusFilter === "confirmed") return r.status === "completed" || r.status === "converted";
    if (statusFilter === "expired") return r.status === "expired";
    if (statusFilter === "reversed") return r.status === "reversed";
    return true;
  });

  const { paidBonus, pendingBonus, creditUsedBonus } = (referrals ?? []).reduce(
    (acc, r) => {
      if (r.status === "completed" || r.status === "converted") {
        const amount = parseFloat(r.bonusAmount) || 0;
        if (r.bonusCreditUsedAt) {
          // Use actual amount consumed (supports partial rows)
          const usedAmt = r.bonusCreditUsedAmount ? parseFloat(r.bonusCreditUsedAmount) : amount;
          acc.creditUsedBonus += usedAmt;
          // If partially consumed, remaining portion goes to pending
          const remaining = amount - usedAmt;
          if (remaining > 0.005 && !r.bonusPaid) acc.pendingBonus += remaining;
        } else if (r.bonusPaid) {
          acc.paidBonus += amount;
        } else {
          acc.pendingBonus += amount;
        }
      }
      return acc;
    },
    { paidBonus: 0, pendingBonus: 0, creditUsedBonus: 0 },
  );

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
      {/* Campaign banner */}
      {activeCampaign && countdown && (
        <div
          className="rounded-xl p-4 text-white text-center shadow-md animate-in fade-in slide-in-from-top-2 duration-500"
          style={{ background: `linear-gradient(135deg, ${primaryColor}dd, ${secondaryColor}dd)` }}
        >
          <div className="flex items-center justify-center gap-2 font-bold text-base mb-1">
            <span className="text-lg">🔥</span>
            <span>
              {activeCampaign.bannerText
                ? activeCampaign.bannerText
                : activeCampaign.bonusType === "multiplier"
                  ? `Bônus ${activeCampaign.bonusValue}× por tempo limitado!`
                  : `Bônus extra de R$ ${Number(activeCampaign.bonusValue).toFixed(2).replace(".", ",")} nesta campanha!`}
            </span>
          </div>
          <p className="text-white/80 text-xs">
            Termina em{" "}
            <span className="font-mono font-semibold text-white bg-black/20 px-1.5 py-0.5 rounded">
              {countdown}
            </span>
          </p>
        </div>
      )}

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
          {ref.pointsPerReferral > 0 && profile.loyalty && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mt-2">
              <Coins className="w-3.5 h-3.5 shrink-0" />
              <span>
                Ganhe também <strong>{ref.pointsPerReferral.toLocaleString("pt-BR")} pontos</strong> de fidelidade por indicação confirmada!
              </span>
            </div>
          )}
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

          {/* QR Code preview */}
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleShowQR}
            disabled={qrLoading}
          >
            {qrLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <QrCode className="w-4 h-4" />
            )}
            Gerar QR Code
          </Button>
        </CardContent>
      </Card>

      {/* Referral history list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Histórico de indicações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!loadingReferrals && referrals && referrals.length > 0 && (
            <>
              {/* Filter tabs */}
              <div className="flex gap-1 mb-4 p-1 bg-muted/50 rounded-xl">
                {(
                  [
                    { key: "all",       label: "Todas",       count: referrals.length },
                    { key: "pending",   label: "Pendentes",   count: referrals.filter((r) => r.status === "pending").length },
                    { key: "confirmed", label: "Confirmadas", count: referrals.filter((r) => r.status === "completed" || r.status === "converted").length },
                    { key: "expired",   label: "Expiradas",   count: referrals.filter((r) => r.status === "expired").length },
                    { key: "reversed",  label: "Canceladas",  count: referrals.filter((r) => r.status === "reversed").length },
                  ] as const
                ).filter(({ key, count }) => key === "all" || count > 0)
                  .map(({ key, label, count }) => {
                  const isActive = statusFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setVisibleCount(PAGE_SIZE);
                        const params = new URLSearchParams(window.location.search);
                        if (key === "all") {
                          params.delete("status");
                        } else {
                          params.set("status", key);
                        }
                        const qs = params.toString();
                        navigate(`/loja/${slug}/minhas-indicacoes${qs ? `?${qs}` : ""}`, { replace: true });
                      }}
                      className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                      style={
                        isActive
                          ? { background: primaryColor, color: "#fff" }
                          : { background: "transparent", color: "var(--muted-foreground)" }
                      }
                    >
                      {label}
                      <span
                        className="inline-flex items-center justify-center rounded-full text-[10px] font-bold leading-none px-1.5 py-0.5 min-w-[18px]"
                        style={
                          isActive
                            ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
                            : { background: "var(--muted)", color: "var(--muted-foreground)" }
                        }
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Bonus summary pills */}
              {(paidBonus > 0 || pendingBonus > 0 || creditUsedBonus > 0) && (
                <div className="flex gap-2 flex-wrap mb-4">
                  {paidBonus > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {formatCurrency(paidBonus)} recebido
                    </span>
                  )}
                  {pendingBonus > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                      <Clock className="w-3.5 h-3.5" />
                      {formatCurrency(pendingBonus)} a receber
                    </span>
                  )}
                  {creditUsedBonus > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                      <Gift className="w-3.5 h-3.5" />
                      {formatCurrency(creditUsedBonus)} usado como crédito
                    </span>
                  )}
                </div>
              )}
            </>
          )}
          {loadingReferrals ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 items-start py-3 border-b last:border-0">
                  <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : !referrals || referrals.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-sm mb-1">Nenhuma indicação ainda</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Compartilhe seu código acima e acompanhe aqui quando seus amigos se cadastrarem.
              </p>
            </div>
          ) : filteredReferrals.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-sm mb-1">Nenhuma indicação nesta categoria</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Não há indicações com o status selecionado.
              </p>
            </div>
          ) : (
            <div>
              {filteredReferrals.slice(0, visibleCount).map((r) => (
                <ReferralHistoryRow key={r.id} r={r} primaryColor={primaryColor} />
              ))}
              {filteredReferrals.length > visibleCount && (
                <button
                  className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                  Ver mais ({filteredReferrals.length - visibleCount} restantes)
                </button>
              )}
              {visibleCount > PAGE_SIZE && (
                <button
                  className="w-full mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setVisibleCount(PAGE_SIZE)}
                >
                  Mostrar menos
                </button>
              )}
            </div>
          )}
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

      {/* QR Code preview dialog */}
      <Dialog open={!!qrPreviewUrl} onOpenChange={(open) => { if (!open) setQrPreviewUrl(null); }}>
        <DialogContent className="max-w-xs w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              QR Code de indicação
            </DialogTitle>
            <DialogDescription>
              Escaneie para acessar sua página de indicação.
            </DialogDescription>
          </DialogHeader>
          {qrPreviewUrl && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="rounded-xl border p-3 bg-white shadow-sm">
                <img
                  src={qrPreviewUrl}
                  alt="QR Code de indicação"
                  className="w-56 h-56 object-contain"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Código: <span className="font-mono font-semibold">{referralCode}</span>
              </p>
              <div className="flex gap-2 w-full">
                <Button className="flex-1 gap-2" onClick={handleDownloadQR}>
                  <QrCode className="w-4 h-4" />
                  Baixar
                </Button>
                {typeof navigator !== "undefined" &&
                  "canShare" in navigator &&
                  navigator.canShare({ files: [new File([], "test.png", { type: "image/png" })] }) && (
                    <Button variant="outline" className="flex-1 gap-2" onClick={handleShareQR}>
                      <Share2 className="w-4 h-4" />
                      Compartilhar
                    </Button>
                  )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
