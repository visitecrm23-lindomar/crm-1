import { useState, useEffect, type ReactElement } from "react";
import { useLocation, useSearch } from "wouter";
import { clientPortalApi, type ClientPortalProfile, type ClientLoyalty, type ClientReferral, type FavoritesResponse, type ClientPortalReservation, type ClientLoyaltyTransaction } from "@/lib/clientPortalApi";
import QRCode from "qrcode";
import { useGetMe } from "@workspace/api-client-react";
import { RESERVATION_STATUS } from "@workspace/permissions";
import { useSignIn, useClerk } from "@clerk/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarCheck,
  User,
  Share2,
  Copy,
  Check,
  CheckCircle,
  Clock,
  XCircle,
  Package,
  MapPin,
  QrCode,
  Gift,
  TrendingUp,
  Loader2,
  ShieldCheck,
  Mail,
  KeyRound,
  LayoutDashboard,
  Star,
  DollarSign,
  Plane,
  Users,
  Coins,
  ArrowRight,
  AlertCircle,
  Download,
  MessageCircle,
  Wallet,
  Heart,
} from "lucide-react";
import { formatCurrency as fmtCurrencyLib, formatDateShort } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:   { label: "Aguardando",  variant: "secondary" },
  confirmed: { label: "Confirmado",  variant: "default" },
  completed: { label: "Concluído",   variant: "default" },
  cancelled: { label: "Cancelado",   variant: "destructive" },
  processing:{ label: "Processando", variant: "secondary" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_MAP[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case RESERVATION_STATUS.CONFIRMED: return <CheckCircle className="w-5 h-5 text-blue-500" />;
    case RESERVATION_STATUS.COMPLETED: return <CheckCircle className="w-5 h-5 text-green-500" />;
    case RESERVATION_STATUS.CANCELLED: return <XCircle className="w-5 h-5 text-red-500" />;
    case "processing": return <Package className="w-5 h-5 text-purple-500" />;
    default: return <Clock className="w-5 h-5 text-yellow-500" />;
  }
}

const fmtDate = (dateStr: string | null) => formatDateShort(dateStr) ?? "A confirmar";
const fmtCurrency = fmtCurrencyLib;

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  return diff;
}

function daysUntilBirthday(birthDateStr: string | null): number | null {
  if (!birthDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [, monthStr, dayStr] = birthDateStr.split("-");
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  if (isNaN(month) || isNaN(day)) return null;
  const year = today.getFullYear();
  let next = new Date(year, month, day);
  next.setHours(0, 0, 0, 0);
  if (next.getTime() < today.getTime()) {
    next = new Date(year + 1, month, day);
    next.setHours(0, 0, 0, 0);
  }
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

function ReservationCard({
  r,
  compact = false,
  onRedeemClick,
}: {
  r: ClientPortalProfile["reservations"][number];
  compact?: boolean;
  onRedeemClick?: () => void;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const days = daysUntil(r.tripDepartureDate);
  const isImminent = days !== null && days >= 0 && days <= 30;

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function handleDownloadVoucher() {
    setDownloading(true);
    try {
      const res = await fetch(`${BASE}/api/client/reservations/${r.id}/voucher`, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.message ?? err.error ?? "Erro ao gerar comprovante");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTrip = r.tripName.replace(/[^a-z0-9]/gi, "_").slice(0, 30);
      a.href = url;
      a.download = `comprovante_${safeTrip}_${r.voucherCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "Erro ao baixar comprovante",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start gap-4 p-4">
          <div className="mt-1">
            <StatusIcon status={r.status} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h4 className="font-semibold text-base leading-tight">{r.tripName}</h4>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {r.tripDestination}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {isImminent && days! > 0 && (
                  <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-xs">
                    {days} dia{days !== 1 ? "s" : ""}
                  </Badge>
                )}
                {days === 0 && (
                  <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
                    Hoje!
                  </Badge>
                )}
                <StatusBadge status={r.status} />
              </div>
            </div>

            {!compact && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Partida</p>
                  <p className="font-medium">{fmtDate(r.tripDepartureDate)}</p>
                </div>
                {r.tripReturnDate && (
                  <div>
                    <p className="text-muted-foreground text-xs">Retorno</p>
                    <p className="font-medium">{fmtDate(r.tripReturnDate)}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="font-medium">{fmtCurrency(r.totalValue)}</p>
                </div>
              </div>
            )}

            {compact && (
              <div className="mt-2 flex gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Partida</p>
                  <p className="font-medium">{fmtDate(r.tripDepartureDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="font-medium">{fmtCurrency(r.totalValue)}</p>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {r.reservationNumber && (
                <div className="flex items-center gap-1.5 text-xs bg-muted rounded px-2 py-1">
                  <CalendarCheck className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono">{r.reservationNumber}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs bg-muted rounded px-2 py-1">
                <QrCode className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono">{r.voucherCode}</span>
              </div>
              {r.seatsCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs bg-muted rounded px-2 py-1">
                  <Users className="w-3 h-3 text-muted-foreground" />
                  <span>{r.seatsCount} passageiro{r.seatsCount !== 1 ? "s" : ""}</span>
                </div>
              )}
              {r.boardingPointName && (
                <div className="flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-1">
                  <MapPin className="w-3 h-3" />
                  <span>
                    {r.boardingPointName}
                    {r.boardingPointTime ? ` — ${r.boardingPointTime}` : ""}
                  </span>
                </div>
              )}
              {r.balance > 0 && (
                <div className="flex items-center gap-1.5 text-xs bg-orange-50 border border-orange-200 text-orange-700 rounded px-2 py-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>Saldo pendente: {fmtCurrency(r.balance)}</span>
                </div>
              )}
              {r.balance > 0 && onRedeemClick && (
                <button
                  onClick={onRedeemClick}
                  className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded px-2 py-1 hover:bg-amber-100 transition-colors"
                >
                  <Coins className="w-3 h-3" />
                  <span>Usar pontos</span>
                </button>
              )}
            </div>

            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleDownloadVoucher}
                disabled={downloading}
              >
                {downloading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {downloading ? "Gerando..." : "Baixar comprovante"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CARD_TIER_GRADIENTS: Record<string, string> = {
  bronze:  "from-amber-700 via-amber-500 to-yellow-400",
  silver:  "from-slate-600 via-slate-400 to-gray-300",
  gold:    "from-yellow-600 via-yellow-400 to-amber-300",
  diamond: "from-cyan-700 via-cyan-500 to-cyan-300",
};

const CARD_TIER_ICONS: Record<string, string> = {
  bronze:  "🥉",
  silver:  "🥈",
  gold:    "🥇",
  diamond: "💎",
};

const CARD_TIER_LABELS: Record<string, string> = {
  bronze:  "Bronze",
  silver:  "Prata",
  gold:    "Ouro",
  diamond: "Diamante",
};

function ClienteCard({
  profile,
  primaryColor,
}: {
  profile: ClientPortalProfile;
  primaryColor: string;
}) {
  const displayName = profile.client?.name ?? profile.user?.name ?? "Viajante";
  const cpf = profile.client?.cpf ?? null;
  const hasLoyalty = !!profile.loyalty;
  const tierLevel = hasLoyalty ? (profile.loyalty!.tier ?? null) : null;
  const tierLabel = tierLevel ? (CARD_TIER_LABELS[tierLevel] ?? tierLevel) : null;
  const loyaltyPoints = profile.loyalty?.availablePoints ?? null;
  const referralCode = profile.referral?.code ?? null;
  const agencyName = profile.tenant?.name ?? "VisiteCRM";

  const maskedNumber = cpf
    ? `•••• •••• ••• ${cpf.replace(/\D/g, "").slice(-3)}`
    : "•••• •••• •••• ••••";

  const tierGradient = hasLoyalty && tierLevel ? CARD_TIER_GRADIENTS[tierLevel] : null;
  const tierIcon = tierLevel ? CARD_TIER_ICONS[tierLevel] : null;

  return (
    <div className="flex justify-center">
      <div
        className={`relative w-full max-w-[420px] rounded-2xl overflow-hidden shadow-2xl text-white select-none${tierGradient ? ` bg-gradient-to-br ${tierGradient}` : ""}`}
        style={!tierGradient ? { background: `linear-gradient(135deg, ${primaryColor}ee, ${primaryColor}88)` } : undefined}
        aria-label="Cartão de viajante"
      >
        <div className="aspect-[1.586/1] relative p-5 flex flex-col justify-between">
          {/* Decorative background circles */}
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-14 -left-10 w-56 h-56 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute top-6 right-16 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />

          {/* Top row: agency name + chip */}
          <div className="relative flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] text-white/60 uppercase tracking-widest leading-none mb-0.5">Cartão de Viajante</p>
              <p className="text-sm font-bold truncate drop-shadow-sm">{agencyName}</p>
            </div>
            {/* EMV chip SVG */}
            <svg width="36" height="28" viewBox="0 0 36 28" className="shrink-0 opacity-95" aria-hidden="true">
              <rect x="1" y="1" width="34" height="26" rx="4" fill="#C9A227" stroke="#E8C14A" strokeWidth="0.8"/>
              <rect x="12" y="1" width="12" height="26" fill="#B8901E" opacity="0.55"/>
              <rect x="1" y="9.5" width="34" height="9" fill="#B8901E" opacity="0.55"/>
              <line x1="12" y1="1" x2="12" y2="27" stroke="#E8C14A" strokeWidth="0.4" opacity="0.5"/>
              <line x1="24" y1="1" x2="24" y2="27" stroke="#E8C14A" strokeWidth="0.4" opacity="0.5"/>
              <line x1="1" y1="9.5" x2="35" y2="9.5" stroke="#E8C14A" strokeWidth="0.4" opacity="0.5"/>
              <line x1="1" y1="18.5" x2="35" y2="18.5" stroke="#E8C14A" strokeWidth="0.4" opacity="0.5"/>
            </svg>
          </div>

          {/* Card number / points display */}
          <div className="relative">
            {hasLoyalty ? (
              <div>
                <p className="text-[9px] text-white/55 uppercase tracking-widest mb-0.5">Pontos disponíveis</p>
                <p className="text-2xl font-bold text-white drop-shadow-sm tabular-nums">
                  {(loyaltyPoints ?? 0).toLocaleString("pt-BR")} <span className="text-base font-semibold opacity-80">PTS</span>
                </p>
              </div>
            ) : (
              <p className="text-lg font-mono font-semibold text-white tracking-[0.22em] drop-shadow-sm">{maskedNumber}</p>
            )}
          </div>

          {/* Bottom row: name / tier / points-or-code */}
          <div className="relative flex items-end justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[8px] text-white/55 uppercase tracking-wider mb-0.5">Viajante</p>
              <p className="text-[13px] font-bold uppercase truncate drop-shadow-sm leading-tight text-white">{displayName}</p>
            </div>

            <div className="text-center shrink-0">
              <p className="text-[8px] text-white/55 uppercase tracking-wider mb-0.5">Nível</p>
              <p className="text-[11px] font-bold text-white drop-shadow-sm leading-tight">
                {hasLoyalty && tierLabel ? `${tierIcon} ${tierLabel}` : "Membro"}
              </p>
            </div>

            {referralCode ? (
              <div className="text-right shrink-0">
                <p className="text-[8px] text-white/55 uppercase tracking-wider mb-0.5">Código</p>
                <p className="text-[11px] font-mono font-bold text-white drop-shadow-sm leading-tight">{referralCode}</p>
              </div>
            ) : null}
          </div>

          {/* Contactless icon (top-right corner) */}
          <svg
            className="absolute bottom-4 right-5 opacity-30"
            width="22" height="22" viewBox="0 0 24 24" fill="none"
            aria-hidden="true"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="none"/>
            <path d="M6.5 12a5.5 5.5 0 0 1 5.5-5.5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
            <path d="M9 12a3 3 0 0 1 3-3" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
            <circle cx="12" cy="12" r="1.2" fill="white"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

const STAR_LABELS = ["", "Péssimo", "Ruim", "Regular", "Bom", "Ótimo"];

function StarRating({
  value,
  onChange,
  label,
  hint,
}: {
  value: number | null;
  onChange: (v: number) => void;
  label: string;
  hint?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const isActive = (star: number) =>
    hovered !== null ? star <= hovered : value !== null && star <= value;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onChange(star)}
            className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
          >
            <Star
              className={`w-6 h-6 transition-colors ${
                isActive(star)
                  ? "fill-amber-400 text-amber-400"
                  : "fill-none text-muted-foreground/30"
              }`}
            />
          </button>
        ))}
        {value !== null && value > 0 && (
          <span className="ml-1.5 text-xs text-muted-foreground">{STAR_LABELS[value]}</span>
        )}
      </div>
    </div>
  );
}

function NpsCard({ reservation }: { reservation: ClientPortalProfile["reservations"][number] }) {
  const { toast } = useToast();
  const [score, setScore] = useState<number | null>(null);
  const [scoreTransport, setScoreTransport] = useState<number | null>(null);
  const [scoreService, setScoreService] = useState<number | null>(null);
  const [scoreOrganization, setScoreOrganization] = useState<number | null>(null);
  const [scoreGuide, setScoreGuide] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (score === null) return;
    setSubmitting(true);
    try {
      await clientPortalApi.submitNps({
        reservationId: reservation.id,
        score,
        scoreTransport: scoreTransport,
        scoreService: scoreService,
        scoreOrganization: scoreOrganization,
        scoreGuide: scoreGuide,
        comment: comment || null,
      });
      setSubmitted(true);
    } catch {
      toast({ title: "Erro ao enviar avaliação", description: "Tente novamente mais tarde.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">Obrigado pela avaliação!</p>
            <p className="text-xs text-green-600">Seu feedback é muito importante para nós.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Star className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Como foi sua experiência?</p>
            <p className="text-xs text-muted-foreground">{reservation.tripName}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Em uma escala de 0 a 10, o quanto você recomendaria esta viagem a um amigo?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, i) => {
              const isSelected = score === i;
              const colorClass =
                i <= 6
                  ? isSelected
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                  : i <= 8
                  ? isSelected
                    ? "bg-yellow-500 text-white border-yellow-500"
                    : "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100"
                  : isSelected
                  ? "bg-green-500 text-white border-green-500"
                  : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setScore(i)}
                  className={`w-9 h-9 rounded border font-semibold text-sm transition-colors ${colorClass}`}
                >
                  {i}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Nada provável</span>
            <span>Extremamente provável</span>
          </div>
        </div>
        <div className="space-y-3 pt-2 border-t">
          <p className="text-xs text-muted-foreground">Avalie cada aspecto da viagem (opcional)</p>
          <StarRating
            value={scoreTransport}
            onChange={setScoreTransport}
            label="🚌 Transporte/Ônibus"
          />
          <StarRating
            value={scoreService}
            onChange={setScoreService}
            label="👥 Atendimento da equipe"
          />
          <StarRating
            value={scoreOrganization}
            onChange={setScoreOrganization}
            label="📋 Organização da viagem"
          />
          <StarRating
            value={scoreGuide}
            onChange={setScoreGuide}
            label="🎤 Guia/Monitoria"
            hint="Pule se não houve guia"
          />
        </div>
        <textarea
          placeholder="Conte-nos mais sobre sua experiência (opcional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          maxLength={2000}
        />
        <Button
          size="sm"
          disabled={score === null || submitting}
          onClick={handleSubmit}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Enviando...
            </>
          ) : (
            "Enviar avaliação"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function BirthdayBonusCard({
  daysLeft,
  storeUrl,
}: {
  daysLeft: number;
  storeUrl: string | null;
}) {
  return (
    <div className="rounded-xl overflow-hidden shadow-md">
      <div
        className="p-4 text-white"
        style={{ background: "linear-gradient(135deg, #ec4899, #f59e0b)" }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight">🎉 Seu aniversário está chegando!</p>
            <p className="text-sm text-white/90 mt-0.5">
              {daysLeft === 1
                ? "Falta apenas 1 dia"
                : `Faltam apenas ${daysLeft} dias`}{" "}
              para o seu aniversário e preparamos uma condição especial para você.
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-white/15 border border-white/25 p-3">
          <p className="text-sm font-semibold">🎁 Bônus de Aniversário Exclusivo</p>
          <p className="text-xs text-white/85 mt-1 leading-relaxed">
            Aproveite benefícios e vantagens especiais para celebrar essa data com uma viagem
            inesquecível. Fique atento às próximas novidades e garanta sua próxima experiência com
            condições exclusivas.
          </p>
        </div>

        {storeUrl && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full border-white/50 text-white bg-white/10 hover:bg-white/20 hover:text-white"
            onClick={() => (window.location.href = storeUrl)}
          >
            Ver Pacotes Especiais
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function BirthdayGreetingCard({
  firstName,
  storeUrl,
}: {
  firstName: string;
  storeUrl: string | null;
}) {
  return (
    <div className="rounded-xl overflow-hidden shadow-md">
      <div
        className="p-4 text-white"
        style={{ background: "linear-gradient(135deg, #ec4899, #f59e0b)" }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-xl leading-none">
            🥳
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight">Amanhã é seu dia!</p>
            <p className="text-sm text-white/90 mt-0.5">
              Parabéns antecipado, <span className="font-semibold">{firstName}</span>! 🎉
              Que seu aniversário seja repleto de alegria e novas aventuras.
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-white/15 border border-white/25 p-3">
          <p className="text-sm font-semibold">🎁 Bônus de Aniversário Exclusivo</p>
          <p className="text-xs text-white/85 mt-1 leading-relaxed">
            Preparamos condições especiais para você celebrar essa data com uma viagem
            inesquecível. Fique atento às próximas novidades e garanta sua próxima experiência com
            benefícios exclusivos de aniversariante.
          </p>
        </div>

        {storeUrl && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full border-white/50 text-white bg-white/10 hover:bg-white/20 hover:text-white"
            onClick={() => (window.location.href = storeUrl)}
          >
            Ver Pacotes Especiais
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function InicioTab({
  profile,
  primaryColor,
  onTabChange,
  onGoToReservasFiltered,
}: {
  profile: ClientPortalProfile;
  primaryColor: string;
  onTabChange: (tab: string) => void;
  onGoToReservasFiltered: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const displayName = profile.client?.name ?? profile.user?.name ?? "Viajante";
  const firstName = displayName.split(" ")[0];

  const upcoming = profile.reservations.filter(
    (r) =>
      r.status !== RESERVATION_STATUS.COMPLETED &&
      r.status !== RESERVATION_STATUS.CANCELLED &&
      (!r.tripDepartureDate || r.tripDepartureDate >= today),
  );

  const nextTrip = upcoming[0] ?? null;
  const days = nextTrip ? daysUntil(nextTrip.tripDepartureDate) : null;

  const totalReferrals = profile.referral.totalReferrals;
  const loyaltyPoints = profile.loyalty?.availablePoints ?? null;

  const pendingBalance = profile.reservations.filter(
    (r) => r.balance > 0 && r.status !== RESERVATION_STATUS.CANCELLED,
  );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const bdDays = daysUntilBirthday(profile.client?.birthDate ?? null);

  const npsTrips = profile.reservations.filter(
    (r) =>
      !!r.tripReturnDate &&
      r.tripReturnDate <= today &&
      r.tripReturnDate >= thirtyDaysAgoStr &&
      r.status !== RESERVATION_STATUS.CANCELLED &&
      !r.npsSubmitted,
  );

  const kpis = [
    {
      icon: <Plane className="w-5 h-5" />,
      label: "Próxima Viagem",
      value: nextTrip
        ? fmtDate(nextTrip.tripDepartureDate)
        : "—",
      sub: nextTrip
        ? nextTrip.tripName
        : "Nenhuma viagem agendada",
      color: "text-blue-600",
      bg: "bg-blue-50",
      onClick: () => onTabChange("reservas"),
    },
    {
      icon: <DollarSign className="w-5 h-5" />,
      label: "Total Gasto",
      value: fmtCurrency(profile.stats?.totalSpent ?? 0),
      sub: `em ${profile.reservations.filter(r => r.status === RESERVATION_STATUS.CONFIRMED || r.status === RESERVATION_STATUS.COMPLETED).length} reserva(s)`,
      color: "text-green-600",
      bg: "bg-green-50",
      onClick: () => onTabChange("reservas"),
    },
    {
      icon: <Coins className="w-5 h-5" />,
      label: "Pontos de Fidelidade",
      value: loyaltyPoints !== null ? loyaltyPoints.toLocaleString("pt-BR") : "—",
      sub: loyaltyPoints !== null ? "pontos disponíveis" : "Sem programa ativo",
      color: "text-amber-600",
      bg: "bg-amber-50",
      onClick: () => loyaltyPoints !== null && onTabChange("fidelidade"),
    },
    {
      icon: <Share2 className="w-5 h-5" />,
      label: "Indicações",
      value: totalReferrals.toString(),
      sub: `${profile.referral.completedReferrals} confirmada(s)`,
      color: "text-purple-600",
      bg: "bg-purple-50",
      onClick: () => onTabChange("indicacoes"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <ClienteCard profile={profile} primaryColor={primaryColor} />
        <div className="px-1">
          <p className="text-sm text-muted-foreground">
            Bem-vindo(a) de volta, <span className="font-semibold text-foreground">{firstName}</span>!
            {nextTrip && days !== null && days >= 0 && (
              <span>
                {" "}
                {days === 0
                  ? "Sua próxima viagem é hoje! 🎉"
                  : days === 1
                  ? "Sua próxima viagem é amanhã!"
                  : `Sua próxima viagem começa em ${days} dias.`}
              </span>
            )}
          </p>
          {!nextTrip && profile.tenant?.slug && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => (window.location.href = `/loja/${profile.tenant!.slug}/produtos`)}
            >
              Ver Pacotes
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card
            key={k.label}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={k.onClick}
          >
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg ${k.bg} ${k.color} flex items-center justify-center mb-3`}>
                {k.icon}
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">{k.label}</p>
              <p className="text-xl font-bold leading-tight">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {bdDays === 1 && (
        <BirthdayGreetingCard
          firstName={firstName}
          storeUrl={profile.tenant?.slug ? `/loja/${profile.tenant.slug}/produtos` : null}
        />
      )}

      {bdDays !== null && bdDays >= 2 && bdDays <= 90 && (
        <BirthdayBonusCard
          daysLeft={bdDays}
          storeUrl={profile.tenant?.slug ? `/loja/${profile.tenant.slug}/produtos` : null}
        />
      )}

      {pendingBalance.length > 0 && (
        <button
          type="button"
          className="w-full text-left flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 hover:bg-orange-100 transition-colors"
          onClick={onGoToReservasFiltered}
        >
          <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-800">
              Você tem {pendingBalance.length} reserva{pendingBalance.length !== 1 ? "s" : ""} com pagamento pendente
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              Regularize para garantir sua viagem. Clique para ver as reservas.
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
        </button>
      )}

      {npsTrips.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Como foi sua viagem?
          </h3>
          {npsTrips.map((r) => (
            <NpsCard key={r.id} reservation={r} />
          ))}
        </div>
      )}

      {nextTrip && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Próxima Viagem
          </h3>
          <ReservationCard r={nextTrip} compact={false} />
        </div>
      )}

      {upcoming.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Outras viagens agendadas
            </h3>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => onTabChange("reservas")}>
              Ver todas
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
          <div className="space-y-3">
            {upcoming.slice(1, 3).map((r) => (
              <ReservationCard key={r.id} r={r} compact />
            ))}
          </div>
        </div>
      )}

      {profile.reservations.length === 0 && (
        <div className="text-center py-8">
          <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            Suas reservas aparecerão aqui após a compra de um pacote.
          </p>
        </div>
      )}
    </div>
  );
}

function ReservasTab({
  profile,
  filter,
  onClearFilter,
  loyalty,
  onRefresh,
}: {
  profile: ClientPortalProfile;
  filter?: "com-saldo" | null;
  onClearFilter?: () => void;
  loyalty?: ClientLoyalty | null;
  onRefresh?: () => void;
}) {
  const { toast } = useToast();
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemReservationId, setRedeemReservationId] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);

  const primaryColor = profile.tenant?.primaryColor ?? "#3B82F6";

  function openRedeem(reservationId: string, balance: number) {
    if (!loyalty) return;
    const maxPts = Math.min(loyalty.availablePoints, Math.ceil(balance / loyalty.realPerPoint));
    setRedeemReservationId(reservationId);
    setRedeemPoints(String(maxPts));
    setRedeemOpen(true);
  }

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!loyalty || !redeemReservationId) return;
    const pts = parseInt(redeemPoints, 10);
    if (isNaN(pts) || pts <= 0) return;
    setRedeemLoading(true);
    try {
      const result = await clientPortalApi.redeemLoyaltyPoints(redeemReservationId, pts);
      toast({
        title: "Pontos resgatados com sucesso!",
        description: `${result.pointsRedeemed.toLocaleString("pt-BR")} pts → ${result.discountAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto aplicado.`,
      });
      setRedeemOpen(false);
      setRedeemPoints("");
      setRedeemReservationId("");
      onRefresh?.();
    } catch (err) {
      toast({
        title: "Erro ao resgatar pontos",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setRedeemLoading(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const all = profile.reservations;
  const canRedeem = !!loyalty && loyalty.availablePoints >= loyalty.minRedeemPoints;

  const upcoming = all.filter(
    (r) =>
      r.status !== RESERVATION_STATUS.COMPLETED &&
      r.status !== RESERVATION_STATUS.CANCELLED &&
      (!r.tripDepartureDate || r.tripDepartureDate >= today),
  );
  const past = all.filter(
    (r) =>
      r.status === RESERVATION_STATUS.CANCELLED ||
      r.status === RESERVATION_STATUS.COMPLETED ||
      (!!r.tripDepartureDate && r.tripDepartureDate < today),
  );

  if (!all.length) {
    return (
      <div className="text-center py-16">
        <CalendarCheck className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
        <h3 className="font-semibold text-lg mb-1">Nenhuma reserva encontrada</h3>
        <p className="text-muted-foreground text-sm">
          Suas reservas aparecerão aqui após a compra de um pacote.
        </p>
        {profile.tenant?.slug && (
          <Button
            className="mt-4"
            onClick={() => (window.location.href = `/loja/${profile.tenant!.slug}/produtos`)}
            style={{ backgroundColor: profile.tenant.primaryColor }}
          >
            Ver Pacotes
          </Button>
        )}
      </div>
    );
  }

  const redeemReservation = all.find((r) => r.id === redeemReservationId);
  const maxRedeemPoints = redeemReservation && loyalty
    ? Math.min(loyalty.availablePoints, Math.ceil(redeemReservation.balance / loyalty.realPerPoint))
    : 0;
  const redeemPointsNum = parseInt(redeemPoints, 10) || 0;
  const estimatedDiscount = loyalty ? redeemPointsNum * loyalty.realPerPoint : 0;

  const redeemModal = redeemOpen && loyalty ? (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !redeemLoading && setRedeemOpen(false)} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div>
          <h3 className="font-bold text-lg">Usar pontos nesta reserva</h3>
          <p className="text-sm text-muted-foreground">{redeemReservation?.tripName}</p>
        </div>
        <form onSubmit={handleRedeem} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reservasRedeemInput">Pontos a resgatar</Label>
            <Input
              id="reservasRedeemInput"
              type="number"
              min={loyalty.minRedeemPoints}
              max={maxRedeemPoints}
              value={redeemPoints}
              onChange={(e) => setRedeemPoints(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Disponível: {loyalty.availablePoints.toLocaleString("pt-BR")} pts · Máx. nesta reserva: {maxRedeemPoints.toLocaleString("pt-BR")} pts
            </p>
          </div>
          {redeemPointsNum >= loyalty.minRedeemPoints && (
            <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pontos usados:</span>
                <span className="font-semibold">{redeemPointsNum.toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Desconto estimado:</span>
                <span className="font-bold text-green-600">
                  {estimatedDiscount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setRedeemOpen(false)} disabled={redeemLoading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={redeemLoading || redeemPointsNum < loyalty.minRedeemPoints || redeemPointsNum > maxRedeemPoints}
              style={{ backgroundColor: primaryColor }}
              className="text-white"
            >
              {redeemLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar resgate"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  if (filter === "com-saldo") {
    const withBalance = all.filter(
      (r) => r.balance > 0 && r.status !== RESERVATION_STATUS.CANCELLED,
    );
    return (
      <>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold text-orange-800">
                {withBalance.length} reserva{withBalance.length !== 1 ? "s" : ""} com pagamento pendente
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={onClearFilter}
            >
              Ver todas
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          {withBalance.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
              <p className="text-muted-foreground text-sm">Nenhuma reserva com saldo pendente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {withBalance.map((r) => (
                <ReservationCard
                  key={r.id}
                  r={r}
                  onRedeemClick={canRedeem ? () => openRedeem(r.id, r.balance) : undefined}
                />
              ))}
            </div>
          )}
        </div>
        {redeemModal}
      </>
    );
  }

  return (
    <div className="space-y-8">
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Próximas Viagens
          </h2>
          <div className="space-y-3">
            {upcoming.map((r) => (
              <ReservationCard
                key={r.id}
                r={r}
                onRedeemClick={canRedeem && r.balance > 0 ? () => openRedeem(r.id, r.balance) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Histórico
          </h2>
          <div className="space-y-3">
            {past.map((r) => (
              <ReservationCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      {redeemModal}
    </div>
  );
}

type ResetStep = "idle" | "sending" | "code_sent" | "submitting" | "done";

function SegurancaSection({ email }: { email: string }) {
  const { toast } = useToast();
  const { signIn } = useSignIn();
  const { signOut } = useClerk();
  const [step, setStep] = useState<ResetStep>("idle");
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  function clerkErrorMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
    if (err instanceof Error) return err.message;
    return "Tente novamente.";
  }

  async function handleSendCode() {
    if (!signIn) return;
    setStep("sending");
    setFieldError(null);
    try {
      const initResult = await signIn.create({ identifier: email });
      if (initResult.error) throw initResult.error;
      const sendResult = await signIn.resetPasswordEmailCode.sendCode();
      if (sendResult.error) throw sendResult.error;
      setStep("code_sent");
      toast({ title: "Código enviado!", description: `Verifique sua caixa de entrada em ${email}.` });
    } catch (err) {
      setStep("idle");
      toast({
        title: "Erro ao enviar código",
        description: clerkErrorMessage(err),
        variant: "destructive",
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    if (!code.trim()) { setFieldError("Informe o código recebido."); return; }
    if (password.length < 8) { setFieldError("A senha deve ter ao menos 8 caracteres."); return; }
    if (password !== confirmPassword) { setFieldError("As senhas não coincidem."); return; }
    if (!signIn) return;
    setStep("submitting");
    try {
      const verifyResult = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verifyResult.error) throw verifyResult.error;
      const submitResult = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: false });
      if (submitResult.error) throw submitResult.error;
      setStep("done");
      toast({ title: "Senha atualizada!", description: "Sua nova senha foi definida com sucesso." });
    } catch (err) {
      setStep("code_sent");
      setFieldError(clerkErrorMessage(err));
    }
  }

  function handleCancel() {
    setStep("idle");
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setFieldError(null);
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await clientPortalApi.deleteMyAccount();
      await signOut();
    } catch (err) {
      setDeleting(false);
      toast({
        title: "Erro ao excluir conta",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Segurança
        </CardTitle>
        <CardDescription>Gerencie o acesso à sua conta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3">
          <Mail className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">E-mail</p>
            <p className="text-sm text-muted-foreground">
              Seu e-mail de login é <span className="font-mono">{email}</span>. Por motivos de
              segurança, a alteração de e-mail não está disponível neste portal — entre em
              contato com a sua agência caso precise atualizá-lo.
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-start gap-3">
          <KeyRound className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium mb-1">Senha</p>

            {step === "done" ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check className="w-4 h-4" />
                Senha atualizada com sucesso!
              </div>
            ) : step === "idle" || step === "sending" ? (
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  Clique no botão para receber um código de verificação no seu e-mail e definir uma nova senha.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendCode}
                  disabled={step === "sending" || !email}
                  className="shrink-0"
                >
                  {step === "sending" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Alterar senha
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3 mt-1">
                <p className="text-sm text-muted-foreground">
                  Enviamos um código de verificação para <span className="font-mono">{email}</span>. Insira o código abaixo e escolha uma nova senha.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-code" className="text-xs">Código de verificação</Label>
                  <Input
                    id="reset-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="000000"
                    className="font-mono w-40"
                    maxLength={8}
                    autoComplete="one-time-code"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-password" className="text-xs">Nova senha</Label>
                    <Input
                      id="reset-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-confirm" className="text-xs">Confirmar nova senha</Label>
                    <Input
                      id="reset-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                {fieldError && (
                  <p className="text-xs text-destructive">{fieldError}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" disabled={step === "submitting"}>
                    {step === "submitting" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Salvar nova senha
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={handleCancel} disabled={step === "submitting"}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex items-start gap-3">
          <Trash2 className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive mb-1">Excluir minha conta</p>
            <p className="text-sm text-muted-foreground mb-3">
              Remove permanentemente o seu acesso ao portal. Seus dados de reservas são preservados na agência.
              Esta ação não pode ser desfeita.
            </p>
            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={(open) => {
                setDeleteDialogOpen(open);
                if (!open) setDeleteConfirmText("");
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleting}>
                  {deleting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Excluir minha conta
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir conta do portal?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Seu acesso ao portal será removido imediatamente. Você será desconectado e não poderá mais entrar com este e-mail.
                    Seus históricos de reservas e pagamentos ficam registrados na agência.
                    Esta ação é permanente e irreversível.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="px-1 py-2">
                  <Label htmlFor="delete-confirm" className="text-sm mb-1.5 block">
                    Para confirmar, digite <span className="font-semibold">EXCLUIR</span> abaixo:
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="EXCLUIR"
                    disabled={deleting}
                    autoComplete="off"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={deleting || deleteConfirmText !== "EXCLUIR"}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Sim, excluir minha conta
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DadosTab({ profile, onUpdated }: { profile: ClientPortalProfile; onUpdated: (updated: ClientPortalProfile["client"]) => void }) {
  const { toast } = useToast();
  const client = profile.client;
  const user = profile.user;

  const [name, setName] = useState(client?.name ?? user?.name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [cpf, setCpf] = useState(client?.cpf ?? user?.cpf ?? "");
  const [birthDate, setBirthDate] = useState(client?.birthDate ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await clientPortalApi.updateProfile({
        name: name || undefined,
        phone: phone || null,
        cpf: cpf || null,
        birthDate: birthDate || null,
      });
      onUpdated(updated);
      toast({ title: "Dados atualizados!", description: "Suas informações foram salvas." });
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const email = client?.email ?? user?.email ?? "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações Pessoais</CardTitle>
          <CardDescription>Mantenha seus dados atualizados para facilitar suas reservas.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="portal-name">Nome completo</Label>
                <Input
                  id="portal-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-email">E-mail</Label>
                <Input
                  id="portal-email"
                  value={email}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-phone">Telefone / WhatsApp</Label>
                <Input
                  id="portal-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-cpf">CPF</Label>
                <Input
                  id="portal-cpf"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-birthdate">Data de nascimento</Label>
                <Input
                  id="portal-birthdate"
                  type="date"
                  value={birthDate ?? ""}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Alterações
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <SegurancaSection email={email} />
    </div>
  );
}

const REFERRAL_STATUS_MAP: Record<string, { label: string; color: string; icon: ReactElement | null }> = {
  pending:   { label: "Pendente",   color: "bg-yellow-100 text-yellow-800",  icon: <Clock className="w-3.5 h-3.5" /> },
  completed: { label: "Confirmada", color: "bg-green-100 text-green-800",    icon: <CheckCircle className="w-3.5 h-3.5" /> },
  converted: { label: "Convertida", color: "bg-blue-100 text-blue-800",      icon: <CheckCircle className="w-3.5 h-3.5" /> },
  expired:   { label: "Expirada",   color: "bg-slate-100 text-slate-500",    icon: <XCircle className="w-3.5 h-3.5" /> },
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

function ReferralRow({ r, primaryColor }: { r: ClientReferral; primaryColor: string }) {
  const displayName = r.referredName ?? r.referredEmail ?? "Pessoa indicada";
  const dateLabel = (r.status === "completed" || r.status === "converted") && r.convertedAt
    ? `Convertida em ${new Date(r.convertedAt).toLocaleDateString("pt-BR")}`
    : r.status === "expired" && r.expiresAt
    ? `Expirou em ${new Date(r.expiresAt).toLocaleDateString("pt-BR")}`
    : `Indicada em ${new Date(r.createdAt).toLocaleDateString("pt-BR")}`;

  const bonusValue = parseFloat(r.bonusAmount);

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold mt-0.5"
        style={{ background: `${primaryColor}33`, color: primaryColor }}
      >
        {displayName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{displayName}</span>
          <ReferralStatusBadge status={r.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
        {(r.status === "completed" || r.status === "converted") && bonusValue > 0 && (
          <p className={`text-xs mt-1 font-medium ${r.bonusPaid ? "text-green-600" : "text-orange-500"}`}>
            {r.bonusPaid
              ? `✓ Bônus de ${bonusValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} pago em ${new Date(r.bonusPaidAt!).toLocaleDateString("pt-BR")}`
              : `⏳ Bônus de ${bonusValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} aguardando pagamento`}
          </p>
        )}
      </div>
    </div>
  );
}

function IndicacoesTab({ profile }: { profile: ClientPortalProfile }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [referrals, setReferrals] = useState<ClientReferral[] | null>(null);
  const [loadingReferrals, setLoadingReferrals] = useState(true);

  const referral = profile.referral;
  const tenant = profile.tenant;
  const code = referral.code;
  const shareLink = code && tenant?.slug
    ? `${window.location.origin}/loja/${tenant.slug}/indicacao?code=${code}`
    : null;
  const primaryColor = tenant?.primaryColor ?? "#3B82F6";

  const shareMessage = referral.shareMessage ?? "Use meu código e ganhe desconto na sua viagem!";
  const whatsappUrl = shareLink
    ? `https://wa.me/?text=${encodeURIComponent(`${shareMessage}\n\nMeu código: ${code}\n\n${shareLink}`)}`
    : null;

  useEffect(() => {
    clientPortalApi.getMyReferrals()
      .then((r) => setReferrals(r.data))
      .catch(() => setReferrals([]))
      .finally(() => setLoadingReferrals(false));
  }, []);

  const isConverted = (status: string) => status === "completed" || status === "converted";
  const pendingBonus = (referrals ?? [])
    .filter((r) => isConverted(r.status) && !r.bonusPaid)
    .reduce((sum, r) => sum + parseFloat(r.bonusAmount), 0);
  const paidBonus = (referrals ?? [])
    .filter((r) => isConverted(r.status) && r.bonusPaid)
    .reduce((sum, r) => sum + parseFloat(r.bonusAmount), 0);

  function copyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast({ title: "Código copiado!" });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyLink() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopiedLink(true);
      toast({ title: "Link copiado!" });
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }

  async function downloadQr() {
    if (!shareLink) return;
    setLoadingQr(true);
    try {
      const dataUrl = await QRCode.toDataURL(shareLink, { width: 256, margin: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `qr-indicacao-${code}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast({ title: "Erro ao gerar QR Code", variant: "destructive" });
    } finally {
      setLoadingQr(false);
    }
  }

  if (!code) {
    return (
      <div className="text-center py-16">
        <Gift className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
        <h3 className="font-semibold text-lg mb-1">Código de indicação não disponível</h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Seu código de indicação será gerado automaticamente após a confirmação da sua primeira reserva.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
      >
        <p className="text-white/80 text-sm mb-1">Seu código de indicação</p>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl font-extrabold font-mono tracking-widest">{code}</span>
          <button
            onClick={copyCode}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            title="Copiar código"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-white/70 text-sm mb-4">
          Compartilhe com amigos e ganhe bônus a cada indicação confirmada.
        </p>
        <div className="flex flex-wrap gap-2">
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          )}
          {shareLink && (
            <button
              onClick={downloadQr}
              disabled={loadingQr}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {loadingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              QR Code
            </button>
          )}
        </div>
      </div>

      {shareLink && (
        <Card>
          <CardContent className="pt-4">
            <Label className="text-sm font-medium">Link de indicação</Label>
            <div className="flex gap-2 mt-2">
              <Input value={shareLink} readOnly className="font-mono text-xs bg-muted" />
              <Button variant="outline" size="icon" onClick={copyLink} title="Copiar link">
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier Card */}
      {(() => {
        const tierLevel = referral.currentTierLevel ?? "bronze";
        const tierLabel = referral.currentTierLabel ?? "Bronze";
        const multiplier = referral.currentTierMultiplier ?? 1;
        const progress = referral.tierProgress ?? 0;
        const nextMin = referral.nextTierMin;
        const nextLabel = referral.nextTierLabel;
        const TIER_COLORS: Record<string, { bg: string; text: string; badge: string; badgeText: string }> = {
          bronze:  { bg: "from-amber-600 to-amber-500",    text: "text-amber-900",  badge: "bg-amber-100",  badgeText: "text-amber-700" },
          silver:  { bg: "from-slate-500 to-slate-400",    text: "text-slate-900",  badge: "bg-slate-100",  badgeText: "text-slate-600" },
          gold:    { bg: "from-yellow-500 to-yellow-400",  text: "text-yellow-900", badge: "bg-yellow-100", badgeText: "text-yellow-700" },
          diamond: { bg: "from-cyan-500 to-cyan-400",      text: "text-cyan-900",   badge: "bg-cyan-100",   badgeText: "text-cyan-700" },
        };
        const tc = TIER_COLORS[tierLevel] ?? TIER_COLORS.bronze;
        const completed = referral.completedReferrals;
        return (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Seu nível de indicador</p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${tc.badge} ${tc.badgeText}`}>
                    <Star className="w-3.5 h-3.5" />
                    {tierLabel}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-0.5">Multiplicador de bônus</p>
                  <span className="text-xl font-extrabold" style={{ color: primaryColor }}>
                    {multiplier}×
                  </span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{tierLabel} ({completed} conv.)</span>
                  {nextLabel ? <span>{nextLabel} ({nextMin} conv.)</span> : <span>Nível máximo!</span>}
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${tc.bg} transition-all duration-700`}
                    style={{ width: `${nextLabel ? progress : 100}%` }}
                  />
                </div>
                {nextLabel && nextMin != null && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Faltam {Math.max(nextMin - completed, 0)} indicações confirmadas para {nextLabel}
                  </p>
                )}
                {!nextLabel && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Parabéns! Você está no nível máximo.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1.5" style={{ color: primaryColor }} />
            <p className="text-xl font-bold">{referral.totalReferrals}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <CheckCircle className="w-5 h-5 mx-auto mb-1.5 text-green-500" />
            <p className="text-xl font-bold">{referral.completedReferrals}</p>
            <p className="text-xs text-muted-foreground">Confirmadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1.5 text-orange-400" />
            <p className="text-xl font-bold text-orange-500">
              {pendingBonus.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <p className="text-xs text-muted-foreground">Bônus a receber</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Wallet className="w-5 h-5 mx-auto mb-1.5 text-green-500" />
            <p className="text-xl font-bold text-green-600">
              {paidBonus.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <p className="text-xs text-muted-foreground">Bônus recebido</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Minhas Indicações</CardTitle>
        </CardHeader>
        <CardContent>
          {!loadingReferrals && (paidBonus > 0 || pendingBonus > 0) && (
            <div className="flex gap-2 flex-wrap mb-4">
              {paidBonus > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {paidBonus.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} recebido
                </span>
              )}
              {pendingBonus > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                  <Clock className="w-3.5 h-3.5" />
                  {pendingBonus.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} a receber
                </span>
              )}
            </div>
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
            <div className="text-center py-10">
              <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-sm mb-1">Nenhuma indicação ainda</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Compartilhe seu código acima e acompanhe aqui quando seus amigos se cadastrarem.
              </p>
            </div>
          ) : (
            <div>
              {referrals.map((r) => (
                <ReferralRow key={r.id} r={r} primaryColor={primaryColor} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; min: number; next: number | null; nextLabel: string | null }> = {
  bronze:  { label: "Bronze",   color: "text-amber-700",  bg: "bg-amber-100",  min: 0,    next: 500,  nextLabel: "Prata" },
  silver:  { label: "Prata",    color: "text-slate-500",  bg: "bg-slate-100",  min: 500,  next: 1500, nextLabel: "Ouro" },
  gold:    { label: "Ouro",     color: "text-yellow-500", bg: "bg-yellow-50",  min: 1500, next: 5000, nextLabel: "Diamante" },
  diamond: { label: "Diamante", color: "text-cyan-500",   bg: "bg-cyan-50",    min: 5000, next: null, nextLabel: null },
};

function tierLabel(tier: string): string {
  return TIER_CONFIG[tier.toLowerCase()]?.label ?? tier;
}

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_CONFIG[tier.toLowerCase()];
  if (!cfg) return <Badge variant="outline">{tier}</Badge>;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold ${cfg.bg} ${cfg.color}`}>
      <Star className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

const TRANSACTION_TYPE_MAP: Record<string, { label: string; sign: "+" | "-"; color: string }> = {
  earn:    { label: "Ganho",   sign: "+", color: "text-green-600" },
  redeem:  { label: "Resgate", sign: "-", color: "text-red-600" },
  bonus:   { label: "Bônus",   sign: "+", color: "text-purple-600" },
  expire:  { label: "Expirado",sign: "-", color: "text-orange-500" },
  refund:  { label: "Estorno", sign: "+", color: "text-blue-600" },
  adjust:  { label: "Ajuste",  sign: "+", color: "text-slate-500" },
};

const TIER_BENEFITS_DEFAULT: Record<string, string[]> = {
  bronze: ["Acúmulo de pontos em todas as reservas"],
  silver: ["Acúmulo de pontos em todas as reservas", "Atendimento prioritário", "Acesso antecipado a promoções"],
  gold: ["Acúmulo de pontos em todas as reservas", "Atendimento VIP", "Brindes exclusivos", "Desconto especial em pacotes"],
  diamond: ["Todos os benefícios Ouro", "Consultor exclusivo", "Upgrade gratuito em viagens", "Convites para lançamentos exclusivos"],
};

const TIER_DISPLAY_ICONS: Record<string, string> = {
  bronze: "🥉", silver: "🥈", gold: "🥇", diamond: "💎",
};

function FidelidadeTab({
  loyalty,
  primaryColor,
  reservations,
  onRefresh,
}: {
  loyalty: ClientLoyalty | null;
  primaryColor: string;
  reservations: ClientPortalReservation[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [txItems, setTxItems] = useState<ClientLoyaltyTransaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txInitialized, setTxInitialized] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemReservationId, setRedeemReservationId] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);

  useEffect(() => {
    if (loyalty && !txInitialized) {
      setTxInitialized(true);
      loadTransactions(1, true);
    }
  }, [loyalty]);

  async function loadTransactions(page: number, reset = false) {
    setTxLoading(true);
    try {
      const result = await clientPortalApi.getLoyaltyTransactions(page);
      setTxItems((prev) => (reset ? result.data : [...prev, ...result.data]));
      setTxHasMore(result.hasMore);
      setTxPage(page);
    } catch {
      if (reset && loyalty) setTxItems(loyalty.recentTransactions);
    } finally {
      setTxLoading(false);
    }
  }

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!redeemReservationId || !loyalty) return;
    const pts = parseInt(redeemPoints, 10);
    if (isNaN(pts) || pts <= 0) return;
    setRedeemLoading(true);
    try {
      const result = await clientPortalApi.redeemLoyaltyPoints(redeemReservationId, pts);
      toast({
        title: "Pontos resgatados com sucesso!",
        description: `${result.pointsRedeemed.toLocaleString("pt-BR")} pts → ${result.discountAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto aplicado.`,
      });
      setRedeemOpen(false);
      setRedeemPoints("");
      setRedeemReservationId("");
      onRefresh();
    } catch (err) {
      toast({
        title: "Erro ao resgatar pontos",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setRedeemLoading(false);
    }
  }

  if (!loyalty) {
    return (
      <div className="text-center py-16">
        <Coins className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
        <h3 className="font-semibold text-lg mb-1">Programa de fidelidade não ativo</h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Esta agência ainda não possui um programa de fidelidade. Fique atento às novidades!
        </p>
      </div>
    );
  }

  const tier = loyalty.tier.toLowerCase();
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG["bronze"];
  const nextTierName = tierCfg.nextLabel;
  const progress = tierCfg.next !== null
    ? Math.min(((loyalty.totalPoints - tierCfg.min) / (tierCfg.next - tierCfg.min)) * 100, 100)
    : 100;
  const pointsToNext = tierCfg.next !== null ? Math.max(tierCfg.next - loyalty.totalPoints, 0) : 0;
  const equivalentValue = (loyalty.availablePoints * loyalty.realPerPoint).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const pendingReservations = reservations.filter(
    (r) => r.balance > 0 && r.status !== "cancelled",
  );

  const selectedReservation = pendingReservations.find((r) => r.id === redeemReservationId);
  const maxRedeemPoints = selectedReservation
    ? Math.min(loyalty.availablePoints, Math.ceil(selectedReservation.balance / loyalty.realPerPoint))
    : loyalty.availablePoints;
  const redeemPointsNum = parseInt(redeemPoints, 10) || 0;
  const estimatedDiscount = redeemPointsNum * loyalty.realPerPoint;

  const displayedTransactions = txInitialized ? txItems : loyalty.recentTransactions;
  const tierBenefitsMap: Record<string, string[]> = (loyalty.tierBenefits as Record<string, string[]> | null) ?? TIER_BENEFITS_DEFAULT;

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white/80 text-sm mb-1">Pontos disponíveis</p>
            <p className="text-4xl font-extrabold leading-none">
              {loyalty.availablePoints.toLocaleString("pt-BR")}
            </p>
            <p className="text-white/70 text-sm mt-1">≈ {equivalentValue} em valor</p>
          </div>
          <TierBadge tier={loyalty.tier} />
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-white/80 text-xs mb-1.5">
            <span>{tierLabel(loyalty.tier)}</span>
            {nextTierName && <span>{nextTierName}</span>}
          </div>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full rounded-full bg-white/80 transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          {nextTierName && pointsToNext > 0 && (
            <p className="text-white/70 text-xs mt-1.5">
              Faltam {pointsToNext.toLocaleString("pt-BR")} pontos para {nextTierName}
            </p>
          )}
          {!nextTierName && <p className="text-white/70 text-xs mt-1.5">Você está no nível máximo!</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Pontos acumulados</p>
            <p className="text-xl font-bold">{loyalty.totalPoints.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Acúmulo</p>
            <p className="text-xl font-bold">{loyalty.pointsPerReal} pts/R$</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Mínimo para resgate</p>
            <p className="text-xl font-bold">{loyalty.minRedeemPoints.toLocaleString("pt-BR")} pts</p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Benefits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="w-4 h-4" style={{ color: primaryColor }} />
            Benefícios por nível
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 border-t">
            {(["bronze", "silver", "gold", "diamond"] as const).map((t) => {
              const cfg = TIER_CONFIG[t];
              const benefits = tierBenefitsMap[t] ?? [];
              const isCurrentTier = t === tier;
              return (
                <div key={t} className={`p-3 ${isCurrentTier ? "bg-muted/50" : ""}`}>
                  <div className={`text-xs font-bold mb-2 flex items-center gap-1 ${cfg.color}`}>
                    <span>{TIER_DISPLAY_ICONS[t]}</span>
                    <span>{cfg.label}</span>
                    {isCurrentTier && (
                      <span className="ml-auto text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        seu nível
                      </span>
                    )}
                  </div>
                  {benefits.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sem benefícios</p>
                  ) : (
                    <ul className="space-y-1">
                      {benefits.map((b, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                          <span className="mt-0.5 shrink-0 text-primary">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Redeem Points */}
      {pendingReservations.length > 0 && loyalty.availablePoints >= loyalty.minRedeemPoints && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="w-4 h-4" style={{ color: primaryColor }} />
              Usar pontos em reservas
            </CardTitle>
            <CardDescription>
              Aplique seus {loyalty.availablePoints.toLocaleString("pt-BR")} pontos como desconto nas reservas com saldo pendente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingReservations.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.tripName}</p>
                    <p className="text-xs text-muted-foreground">
                      Saldo pendente: {r.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      setRedeemReservationId(r.id);
                      setRedeemPoints(String(Math.min(loyalty.availablePoints, Math.ceil(r.balance / loyalty.realPerPoint))));
                      setRedeemOpen(true);
                    }}
                  >
                    <Coins className="w-3.5 h-3.5 mr-1.5" />
                    Resgatar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Redemption Modal */}
      {redeemOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !redeemLoading && setRedeemOpen(false)} />
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="font-bold text-lg">Resgatar pontos</h3>
              <p className="text-sm text-muted-foreground">{selectedReservation?.tripName}</p>
            </div>
            <form onSubmit={handleRedeem} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="redeemPointsInput">Pontos a resgatar</Label>
                <Input
                  id="redeemPointsInput"
                  type="number"
                  min={loyalty.minRedeemPoints}
                  max={maxRedeemPoints}
                  value={redeemPoints}
                  onChange={(e) => setRedeemPoints(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Disponível: {loyalty.availablePoints.toLocaleString("pt-BR")} pts · Máx. para esta reserva: {maxRedeemPoints.toLocaleString("pt-BR")} pts
                </p>
              </div>
              {redeemPointsNum >= loyalty.minRedeemPoints && (
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pontos usados:</span>
                    <span className="font-semibold">{redeemPointsNum.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Desconto estimado:</span>
                    <span className="font-bold text-green-600">
                      {estimatedDiscount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setRedeemOpen(false)} disabled={redeemLoading}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={redeemLoading || redeemPointsNum < loyalty.minRedeemPoints || redeemPointsNum > maxRedeemPoints}
                  style={{ backgroundColor: primaryColor }}
                  className="text-white"
                >
                  {redeemLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar resgate"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Extrato de pontos</CardTitle>
          <CardDescription>{loyalty.programName}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {displayedTransactions.length === 0 && !txLoading ? (
            <div className="text-center py-10">
              <Coins className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhuma transação registrada ainda.</p>
            </div>
          ) : (
            <div className="divide-y">
              {displayedTransactions.map((t) => {
                const type = TRANSACTION_TYPE_MAP[t.type] ?? { label: t.type, sign: "+" as const, color: "text-slate-500" };
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {type.label} · {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="ml-4 shrink-0 text-right">
                      <p className={`text-sm font-bold ${type.color}`}>
                        {type.sign}{Math.abs(t.points).toLocaleString("pt-BR")} pts
                      </p>
                      {t.runningBalance !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          saldo: {t.runningBalance.toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {txLoading && (
                <div className="py-4 text-center">
                  <Loader2 className="w-4 h-4 mx-auto animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
          {txHasMore && !txLoading && (
            <div className="p-4 border-t">
              <Button variant="outline" size="sm" className="w-full" onClick={() => loadTransactions(txPage + 1)}>
                Carregar mais
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreferenciasTab({
  profile,
  onUpdated,
}: {
  profile: ClientPortalProfile;
  onUpdated: (updated: ClientPortalProfile["client"]) => void;
}) {
  const { toast } = useToast();
  const c = profile.client;

  const [musicalPreferences, setMusicalPreferences] = useState(c?.musicalPreferences ?? "");
  const [favoriteDrink, setFavoriteDrink] = useState(c?.favoriteDrink ?? "");
  const [dreamDestinations, setDreamDestinations] = useState<string[]>(c?.dreamDestinations ?? []);
  const [dreamInput, setDreamInput] = useState("");
  const [foodPreferences, setFoodPreferences] = useState(c?.foodPreferences ?? "");
  const [birthDate, setBirthDate] = useState(c?.birthDate ?? "");
  const [travelInterests, setTravelInterests] = useState<string[]>(c?.travelInterests ?? []);
  const [likesPhotosVideos, setLikesPhotosVideos] = useState<boolean | null>(c?.likesPhotosVideos ?? null);
  const [preferredDestinationTypes, setPreferredDestinationTypes] = useState<string[]>(c?.preferredDestinationTypes ?? []);
  const [travelPreference, setTravelPreference] = useState(c?.travelPreference ?? "");
  const [saving, setSaving] = useState(false);

  const DESTINATION_TYPES = ["Praia", "Serra/Montanha", "Aventura", "Cultural", "Religioso", "Ecoturismo", "Campo/Fazenda", "Cidade/Urbano", "Internacional"];
  const TRAVEL_INTERESTS_OPTIONS = ["Gastronomia", "Natureza", "Cultura e história", "Compras", "Aventura", "Religiosidade", "Descanso", "Ecoturismo", "Arte e música", "Fotografia"];
  const TRAVEL_STYLES = ["Em grupo", "A dois (casal)", "Em família", "Sozinho(a)"];

  function toggleMulti(arr: string[], val: string, setArr: (v: string[]) => void) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  function addDream() {
    const v = dreamInput.trim();
    if (v && !dreamDestinations.includes(v)) {
      setDreamDestinations((prev) => [...prev, v]);
    }
    setDreamInput("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      await clientPortalApi.updatePreferences({
        musicalPreferences: musicalPreferences || null,
        favoriteDrink: favoriteDrink || null,
        dreamDestinations,
        foodPreferences: foodPreferences || null,
        birthDate: birthDate || null,
        travelInterests,
        likesPhotosVideos,
        preferredDestinationTypes,
        travelPreference: travelPreference || null,
      });
      if (c) {
        onUpdated({
          ...c,
          musicalPreferences: musicalPreferences || null,
          favoriteDrink: favoriteDrink || null,
          dreamDestinations,
          foodPreferences: foodPreferences || null,
          birthDate: birthDate || null,
          travelInterests,
          likesPhotosVideos,
          preferredDestinationTypes,
          travelPreference: travelPreference || null,
        });
      }
      toast({ title: "Preferências salvas!", description: "Suas informações foram atualizadas." });
    } catch {
      toast({ title: "Erro ao salvar", description: "Tente novamente mais tarde.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!c) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Complete seu cadastro para personalizar suas preferências de viagem.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="font-semibold text-base">Suas preferências de viagem</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Essas informações nos ajudam a criar experiências mais personalizadas para você.
        </p>
      </div>

      <div className="grid gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="musicalPreferences">🎵 Música ou estilo musical favorito</Label>
          <Input
            id="musicalPreferences"
            placeholder="Ex: Sertanejo, MPB, Rock…"
            value={musicalPreferences}
            onChange={(e) => setMusicalPreferences(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="favoriteDrink">🥤 Bebida favorita</Label>
          <Input
            id="favoriteDrink"
            placeholder="Ex: Suco de laranja, Café, Vinho…"
            value={favoriteDrink}
            onChange={(e) => setFavoriteDrink(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="space-y-1.5">
          <Label>🌎 Destinos dos seus sonhos</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Ex: Paris, Fernando de Noronha…"
              value={dreamInput}
              onChange={(e) => setDreamInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDream();
                }
              }}
              maxLength={200}
            />
            <Button type="button" variant="outline" size="sm" onClick={addDream} className="shrink-0">
              Adicionar
            </Button>
          </div>
          {dreamDestinations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {dreamDestinations.map((dest, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-0.5 text-sm"
                >
                  {dest}
                  <button
                    type="button"
                    onClick={() => setDreamDestinations((prev) => prev.filter((_, j) => j !== i))}
                    className="ml-0.5 text-blue-400 hover:text-blue-700 leading-none"
                    aria-label={`Remover ${dest}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="foodPreferences">🍽️ Comida favorita</Label>
          <Input
            id="foodPreferences"
            placeholder="Ex: Churrasco, Frutos do mar, Pizza…"
            value={foodPreferences}
            onChange={(e) => setFoodPreferences(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="birthDate">🎂 Data de aniversário</Label>
          <Input
            id="birthDate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-2">
          <Label>
            🏖️ Tipo de destino preferido{" "}
            <span className="text-muted-foreground text-xs font-normal">(pode escolher mais de um)</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {DESTINATION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleMulti(preferredDestinationTypes, type, setPreferredDestinationTypes)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  preferredDestinationTypes.includes(type)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            🎯 Principais interesses durante a viagem{" "}
            <span className="text-muted-foreground text-xs font-normal">(pode escolher mais de um)</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {TRAVEL_INTERESTS_OPTIONS.map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => toggleMulti(travelInterests, interest, setTravelInterests)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  travelInterests.includes(interest)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {interest}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>📸 Você gosta de registrar suas viagens com fotos e vídeos?</Label>
          <div className="flex gap-2">
            {([true, false] as const).map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setLikesPhotosVideos(val)}
                className={`px-5 py-2 rounded-md text-sm border transition-colors ${
                  likesPhotosVideos === val
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {val ? "Sim" : "Não"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>🚌 Como você prefere viajar?</Label>
          <div className="flex flex-wrap gap-2">
            {TRAVEL_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setTravelPreference(travelPreference === style ? "" : style)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  travelPreference === style
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Salvando…
          </>
        ) : (
          "Salvar preferências"
        )}
      </Button>
    </div>
  );
}

function FavoriteCard({
  name,
  imageUrl,
  price,
  salePrice,
  destination,
  link,
  onRemove,
}: {
  name: string;
  imageUrl: string | null;
  price: string;
  salePrice: string | null;
  destination: string | null;
  link: string | null;
  onRemove: () => void;
}) {
  const [, navigate] = useLocation();
  const displayPrice = salePrice ?? price;
  const hasDiscount = !!salePrice;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex gap-3 p-3">
          <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-blue-100 to-blue-200">
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <MapPin className="w-6 h-6 text-blue-300" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm line-clamp-2 leading-tight mb-1">{name}</h4>
            {destination && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <MapPin className="w-3 h-3" /> {destination}
              </div>
            )}
            <div className="flex items-center gap-2 mt-auto">
              {hasDiscount && (
                <span className="text-xs text-muted-foreground line-through">
                  R$ {parseFloat(price).toFixed(2)}
                </span>
              )}
              <span className="text-sm font-bold text-primary">
                R$ {parseFloat(displayPrice).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0 justify-center">
            {link && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-3"
                onClick={() => navigate(link)}
              >
                Ver
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
              onClick={onRemove}
              title="Remover dos favoritos"
            >
              <Heart className="w-4 h-4 fill-current" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FavoritosTab({ tenantSlug }: { tenantSlug: string | null }) {
  const { toast } = useToast();
  const [data, setData] = useState<FavoritesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientPortalApi
      .getFavorites()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleRemove(itemType: "trip" | "product", itemId: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        trips: itemType === "trip" ? prev.trips.filter((t) => t.tripId !== itemId) : prev.trips,
        products: itemType === "product" ? prev.products.filter((p) => p.productId !== itemId) : prev.products,
      };
    });
    try {
      await clientPortalApi.removeFavorite(itemType, itemId);
    } catch {
      clientPortalApi.getFavorites().then(setData).catch(() => {});
      toast({ title: "Erro ao remover favorito", description: "Tente novamente.", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const total = (data?.trips.length ?? 0) + (data?.products.length ?? 0);

  if (total === 0) {
    return (
      <div className="text-center py-16">
        <Heart className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
        <h3 className="font-semibold text-lg mb-1">Nenhum favorito ainda</h3>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Toque no ❤ nos cards da loja para guardar suas viagens preferidas aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data?.trips.map((trip) => (
        <FavoriteCard
          key={trip.favoriteId}
          name={trip.name}
          imageUrl={trip.imageUrl}
          price={trip.price}
          salePrice={trip.salePrice}
          destination={trip.destination}
          link={tenantSlug ? `/loja/${tenantSlug}/produtos/${trip.productSlug}` : null}
          onRemove={() => handleRemove("trip", trip.tripId)}
        />
      ))}
      {data?.products.map((product) => (
        <FavoriteCard
          key={product.favoriteId}
          name={product.name}
          imageUrl={product.imageUrl}
          price={product.price}
          salePrice={product.salePrice}
          destination={null}
          link={tenantSlug ? `/loja/${tenantSlug}/produtos/${product.productSlug}` : null}
          onRemove={() => handleRemove("product", product.productId)}
        />
      ))}
    </div>
  );
}

const VALID_PERFIL_TABS = ["inicio", "reservas", "dados", "indicacoes", "fidelidade", "preferencias", "favoritos"];

export default function PerfilPage() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const { data: me } = useGetMe();
  const [profile, setProfile] = useState<ClientPortalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState(() => {
    const t = new URLSearchParams(searchStr).get("tab");
    return VALID_PERFIL_TABS.includes(t ?? "") ? t! : "inicio";
  });
  const [reservationFilter, setReservationFilter] = useState<"com-saldo" | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(searchStr).get("tab");
    if (t && VALID_PERFIL_TABS.includes(t)) setActiveTab(t);
  }, [searchStr]);

  useEffect(() => {
    clientPortalApi
      .getProfile()
      .then(setProfile)
      .catch((err) => setError(err.message ?? "Erro ao carregar perfil"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{error ?? "Não foi possível carregar o perfil."}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>
          Voltar
        </Button>
      </div>
    );
  }

  const primaryColor = profile.tenant?.primaryColor ?? "#3B82F6";

  return (
    <div>
      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          if (tab === "reservas") setReservationFilter(null);
          setActiveTab(tab);
          const params = new URLSearchParams(searchStr);
          params.set("tab", tab);
          navigate(`?${params.toString()}`, { replace: true });
        }}
      >
        <TabsList className="mb-6 w-full sm:w-auto flex-wrap h-auto gap-1">
          <TabsTrigger value="inicio" className="flex items-center gap-1.5">
            <LayoutDashboard className="w-4 h-4" />
            Início
          </TabsTrigger>
          <TabsTrigger value="reservas" className="flex items-center gap-1.5">
            <CalendarCheck className="w-4 h-4" />
            Reservas
            {profile.reservations.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 text-xs px-1.5 py-0">
                {profile.reservations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dados" className="flex items-center gap-1.5">
            <User className="w-4 h-4" />
            Meus Dados
          </TabsTrigger>
          <TabsTrigger value="indicacoes" className="flex items-center gap-1.5">
            <Share2 className="w-4 h-4" />
            Indicações
          </TabsTrigger>
          <TabsTrigger value="fidelidade" className="flex items-center gap-1.5">
            <Star className="w-4 h-4" />
            Fidelidade
            {profile.loyalty !== null && (profile.loyalty?.availablePoints ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-0.5 text-xs px-1.5 py-0">
                {(profile.loyalty?.availablePoints ?? 0).toLocaleString("pt-BR")}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="preferencias" className="flex items-center gap-1.5">
            <Heart className="w-4 h-4" />
            Preferências
          </TabsTrigger>
          <TabsTrigger value="favoritos" className="flex items-center gap-1.5">
            <Heart className="w-4 h-4 fill-current text-red-400" />
            Favoritos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inicio">
          <InicioTab
            profile={profile}
            primaryColor={primaryColor}
            onTabChange={(tab) => {
              if (tab === "reservas") setReservationFilter(null);
              setActiveTab(tab);
            }}
            onGoToReservasFiltered={() => {
              setReservationFilter("com-saldo");
              setActiveTab("reservas");
            }}
          />
        </TabsContent>

        <TabsContent value="reservas">
          <ReservasTab
            profile={profile}
            filter={reservationFilter}
            onClearFilter={() => setReservationFilter(null)}
            loyalty={profile.loyalty}
            onRefresh={() => {
              clientPortalApi.getProfile().then(setProfile).catch(() => {});
            }}
          />
        </TabsContent>

        <TabsContent value="dados">
          <DadosTab
            profile={profile}
            onUpdated={(updated) => {
              setProfile((prev) => prev ? { ...prev, client: updated } : prev);
            }}
          />
        </TabsContent>

        <TabsContent value="indicacoes">
          <IndicacoesTab profile={profile} />
        </TabsContent>

        <TabsContent value="fidelidade">
          <FidelidadeTab
            loyalty={profile.loyalty}
            primaryColor={primaryColor}
            reservations={profile.reservations}
            onRefresh={() => {
              clientPortalApi.getProfile().then(setProfile).catch(() => {});
            }}
          />
        </TabsContent>

        <TabsContent value="preferencias">
          <PreferenciasTab
            profile={profile}
            onUpdated={(updated) => {
              setProfile((prev) => prev ? { ...prev, client: updated } : prev);
            }}
          />
        </TabsContent>

        <TabsContent value="favoritos">
          <FavoritosTab tenantSlug={profile.tenant?.slug ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
