import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { clientPortalApi, type ClientPortalProfile } from "@/lib/clientPortalApi";
import { useGetMe } from "@workspace/api-client-react";
import { REFERRAL_STATUS } from "@workspace/permissions";
import { useSignIn } from "@clerk/react";
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
    case "confirmed": return <CheckCircle className="w-5 h-5 text-blue-500" />;
    case "completed": return <CheckCircle className="w-5 h-5 text-green-500" />;
    case "cancelled": return <XCircle className="w-5 h-5 text-red-500" />;
    case "processing": return <Package className="w-5 h-5 text-purple-500" />;
    default: return <Clock className="w-5 h-5 text-yellow-500" />;
  }
}

const fmtDate = (dateStr: string | null) => formatDateShort(dateStr) ?? "A confirmar";
const fmtCurrency = fmtCurrencyLib;

function ReservationCard({ r }: { r: ClientPortalProfile["reservations"][number] }) {
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
              <StatusBadge status={r.status} />
            </div>

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

            <div className="mt-3 flex flex-wrap items-center gap-3">
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
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReservasTab({ profile }: { profile: ClientPortalProfile }) {
  const today = new Date().toISOString().slice(0, 10);
  const all = profile.reservations;

  const upcoming = all.filter(
    (r) =>
      r.status !== REFERRAL_STATUS.COMPLETED &&
      (r.status as string) !== "cancelled" &&
      (!r.tripDepartureDate || r.tripDepartureDate >= today),
  );
  const past = all.filter(
    (r) =>
      (r.status as string) === "cancelled" ||
      r.status === REFERRAL_STATUS.COMPLETED ||
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

  return (
    <div className="space-y-8">
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Próximas Viagens
          </h2>
          <div className="space-y-3">
            {upcoming.map((r) => (
              <ReservationCard key={r.id} r={r} />
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
    </div>
  );
}

type ResetStep = "idle" | "sending" | "code_sent" | "submitting" | "done";

function SegurancaSection({ email }: { email: string }) {
  const { toast } = useToast();
  const { signIn } = useSignIn();
  const [step, setStep] = useState<ResetStep>("idle");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

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
    } catch (err) {
      setStep("idle");
      toast({
        title: "Erro ao enviar código",
        description: err instanceof Error ? err.message : "Tente novamente.",
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
      const msg = err instanceof Error ? err.message : "Verifique o código e tente novamente.";
      setFieldError(msg);
    }
  }

  function handleCancel() {
    setStep("idle");
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setFieldError(null);
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
                  Redefinir senha
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

function IndicacoesTab({ profile }: { profile: ClientPortalProfile }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const referral = profile.referral;
  const tenant = profile.tenant;
  const code = referral.code;
  const shareLink = code && tenant?.slug
    ? `${window.location.origin}/loja/${tenant.slug}/indicacao?code=${code}`
    : null;
  const primaryColor = tenant?.primaryColor ?? "#3B82F6";

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
      toast({ title: "Link copiado!" });
    });
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
        <div className="flex items-center gap-3">
          <span className="text-3xl font-extrabold font-mono tracking-widest">{code}</span>
          <button
            onClick={copyCode}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            title="Copiar código"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-white/70 text-sm mt-2">
          Compartilhe com amigos e ganhe bônus a cada indicação confirmada.
        </p>
      </div>

      {shareLink && (
        <Card>
          <CardContent className="pt-4">
            <Label className="text-sm font-medium">Link de indicação</Label>
            <div className="flex gap-2 mt-2">
              <Input value={shareLink} readOnly className="font-mono text-xs bg-muted" />
              <Button variant="outline" size="icon" onClick={copyLink} title="Copiar link">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-2" style={{ color: primaryColor }} />
            <p className="text-2xl font-bold">{referral.totalReferrals}</p>
            <p className="text-sm text-muted-foreground">Total de indicações</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold">{referral.completedReferrals}</p>
            <p className="text-sm text-muted-foreground">Confirmadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <Gift className="w-6 h-6 mx-auto mb-2" style={{ color: primaryColor }} />
            <p className="text-2xl font-bold">
              {parseFloat(referral.totalEarnings).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
            <p className="text-sm text-muted-foreground">Bônus ganhos</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PerfilPage() {
  const [, navigate] = useLocation();
  const { data: me } = useGetMe();
  const [profile, setProfile] = useState<ClientPortalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const defaultTab = params.get("tab") ?? "reservas";

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

  const displayName = profile.client?.name ?? profile.user?.name ?? me?.name ?? "Viajante";
  const primaryColor = profile.tenant?.primaryColor ?? "#3B82F6";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Olá, {displayName.split(" ")[0]}!</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gerencie suas reservas, dados e programa de indicações.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-6 w-full sm:w-auto">
          <TabsTrigger value="reservas" className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" />
            Minhas Reservas
            {profile.reservations.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {profile.reservations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dados" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Meus Dados
          </TabsTrigger>
          <TabsTrigger value="indicacoes" className="flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Indicações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reservas">
          <ReservasTab profile={profile} />
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
      </Tabs>
    </div>
  );
}
