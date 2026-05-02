import { useState, useRef, useMemo } from "react";
import {
  useGetClient,
  useListReservations,
  useListPayments,
  useGetClientLoyalty,
  useListLoyaltyMembers,
  useListLoyaltyTransactions,
  useListClientActivities,
  useCreateClientActivity,
  useGetClientReferral,
  useGenerateClientReferralCode,
  useGetMe,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone, Mail, MapPin, Calendar, FileText, Download, Upload, Trash2,
  Star, TrendingUp, Gift, Award, Zap, MessageSquare, Loader2, Plus,
  CreditCard, CheckSquare, XCircle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

import { formatCurrency } from "@/lib/utils";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:    { label: "Ativo",    color: "bg-green-100 text-green-800 border-green-200" },
  inactive:  { label: "Inativo",  color: "bg-gray-100 text-gray-800 border-gray-200" },
  lead:      { label: "Lead",     color: "bg-blue-100 text-blue-800 border-blue-200" },
  blocked:   { label: "Bloqueado",color: "bg-red-100 text-red-800 border-red-200" },
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  lead: "Lead", prospect: "Prospecto", client: "Cliente", vip: "VIP", inactive: "Inativo",
};

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  bronze:   { label: "Bronze",   color: "bg-amber-100 text-amber-800" },
  silver:   { label: "Prata",    color: "bg-gray-100 text-gray-700" },
  gold:     { label: "Ouro",     color: "bg-yellow-100 text-yellow-800" },
  diamond:  { label: "Diamante", color: "bg-blue-100 text-blue-800" },
};

const ACTIVITY_TYPE_OPTIONS = [
  { value: "note", label: "Nota" },
  { value: "call", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "meeting", label: "Reunião" },
];

function activityIcon(type: string) {
  switch (type) {
    case "reservation_created": return { Icon: Calendar, bg: "bg-blue-100", color: "text-blue-600" };
    case "reservation_cancelled": return { Icon: XCircle, bg: "bg-red-100", color: "text-red-600" };
    case "checkin": return { Icon: CheckSquare, bg: "bg-green-100", color: "text-green-600" };
    case "payment": return { Icon: CreditCard, bg: "bg-emerald-100", color: "text-emerald-600" };
    case "call": return { Icon: Phone, bg: "bg-green-100", color: "text-green-600" };
    case "whatsapp": return { Icon: MessageSquare, bg: "bg-green-100", color: "text-green-600" };
    case "email": return { Icon: Mail, bg: "bg-sky-100", color: "text-sky-600" };
    case "meeting": return { Icon: Calendar, bg: "bg-purple-100", color: "text-purple-600" };
    case "note": return { Icon: FileText, bg: "bg-gray-100", color: "text-gray-500" };
    default: return { Icon: Zap, bg: "bg-blue-100", color: "text-blue-600" };
  }
}

const AUTO_TYPE_LABELS: Record<string, string> = {
  reservation_created: "Reserva criada",
  reservation_cancelled: "Reserva cancelada",
  checkin: "Check-in realizado",
  payment: "Pagamento recebido",
};

function activityTypeLabel(type: string) {
  if (AUTO_TYPE_LABELS[type]) return AUTO_TYPE_LABELS[type];
  const found = ACTIVITY_TYPE_OPTIONS.find(o => o.value === type);
  return found?.label ?? type;
}

function isAutoActivity(type: string) {
  return type in AUTO_TYPE_LABELS;
}

function ClientHistoryTab({ clientId, isOpen }: { clientId: string; isOpen: boolean }) {
  const { toast } = useToast();
  const [formType, setFormType] = useState("note");
  const [formContent, setFormContent] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: activities, isLoading, refetch } = useListClientActivities(clientId, {
    query: { enabled: isOpen && !!clientId },
  });

  const { mutate: createActivity, isPending } = useCreateClientActivity({
    mutation: {
      onSuccess: () => {
        setFormContent("");
        setShowForm(false);
        refetch();
        toast({ title: "Atividade registrada com sucesso!" });
      },
      onError: () => {
        toast({ title: "Erro ao registrar atividade", variant: "destructive" });
      },
    },
  });

  function handleSubmit() {
    if (!formContent.trim()) return;
    createActivity({ clientId, data: { type: formType, content: formContent.trim() } });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {isLoading ? "Carregando…" : `${(activities ?? []).length} atividade(s)`}
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowForm(s => !s)}>
          <Plus className="w-4 h-4 mr-1" />
          Registrar
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex gap-2">
            {ACTIVITY_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFormType(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${formType === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Descreva a atividade…"
            value={formContent}
            onChange={e => setFormContent(e.target.value)}
            className="min-h-[70px] resize-none text-sm"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setFormContent(""); }}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!formContent.trim() || isPending}>
              {isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : !(activities ?? []).length ? (
        <div className="text-center py-10 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhuma atividade registrada</p>
          <p className="text-xs mt-1">O histórico é criado automaticamente conforme reservas e pagamentos acontecem.</p>
        </div>
      ) : (
        <div className="relative space-y-0">
          {(activities ?? []).map((act, idx) => {
            const { Icon, bg, color } = activityIcon(act.type);
            return (
              <div key={act.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                  </div>
                  {idx < (activities ?? []).length - 1 && <div className="w-px flex-1 bg-border mt-1 mb-1" />}
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{activityTypeLabel(act.type)}</span>
                    {!isAutoActivity(act.type) && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Manual</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{act.content}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {format(parseISO(act.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface StoredDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  data: string;
}

function useClientDocuments(clientId: string) {
  const key = `visite-crm-docs-${clientId}`;
  const [docs, setDocs] = useState<StoredDocument[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
  });
  const save = (updated: StoredDocument[]) => { setDocs(updated); localStorage.setItem(key, JSON.stringify(updated)); };
  const add = (doc: StoredDocument) => save([doc, ...docs]);
  const remove = (id: string) => save(docs.filter(d => d.id !== id));
  return { docs, add, remove };
}

function ClientDocumentsTab({ clientId }: { clientId: string }) {
  const { docs, add, remove } = useClientDocuments(clientId);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 10 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      add({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, uploadedAt: new Date().toISOString(), data: reader.result as string });
      setUploading(false);
      toast({ title: "Documento enviado com sucesso!" });
      if (inputRef.current) inputRef.current.value = "";
    };
    reader.onerror = () => { setUploading(false); toast({ title: "Erro ao ler arquivo", variant: "destructive" }); };
    reader.readAsDataURL(file);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{docs.length} documento(s)</p>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" />{uploading ? "Enviando..." : "Enviar Documento"}
        </Button>
        <input ref={inputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleFile} />
      </div>
      {docs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg bg-muted/20">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nenhum documento enviado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                {doc.type.startsWith("image/") ? <span className="text-xs font-bold text-blue-600">IMG</span> : <FileText className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(doc.size)} · {format(parseISO(doc.uploadedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <a href={doc.data} download={doc.name} title="Baixar"><Download className="w-3.5 h-3.5" /></a>
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(doc.id)} title="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientReferralTab({ clientId }: { clientId: string }) {
  const { data, refetch } = useGetClientReferral(clientId, { query: { enabled: !!clientId } });
  const generate = useGenerateClientReferralCode();
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const storeSlug = (me as { tenant?: { slug?: string } } | undefined)?.tenant?.slug ?? "";
  const shareLink = data?.referralCode && storeSlug
    ? `${window.location.origin}/loja/${storeSlug}/ref/${data.referralCode}`
    : null;

  async function handleGenerate() {
    try {
      await generate.mutateAsync({ clientId });
      toast({ title: "Código de indicação gerado!" });
      refetch();
    } catch {
      toast({ title: "Erro ao gerar código", variant: "destructive" });
    }
  }

  function copyCode() {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode).then(() => {
      setCopied(true);
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

  const STATUS_COLORS: Record<string, string> = {
    pending: "text-yellow-600",
    completed: "text-green-600",
    expired: "text-red-500",
    converted: "text-green-600",
  };

  return (
    <div className="space-y-4 mt-2">
      {/* Referral code card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Código de indicação</p>
            {data?.referralCode ? (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-mono font-bold text-primary">{data.referralCode}</span>
                <Button size="sm" variant="outline" onClick={copyCode} title="Copiar código">
                  {copied ? <CheckSquare className="w-4 h-4 text-green-500" /> : <FileText className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={handleGenerate} disabled={generate.isPending}>
                <Gift className="w-4 h-4 mr-2" />
                {generate.isPending ? "Gerando..." : "Gerar código"}
              </Button>
            )}
          </div>
          <div className="text-right space-y-1">
            <p className="text-xs text-muted-foreground">Indicações bem-sucedidas</p>
            <p className="text-2xl font-bold text-green-600">{data?.successfulReferrals ?? 0}</p>
          </div>
        </div>
        {shareLink && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-1">Link de compartilhamento</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareLink}
                className="flex-1 text-xs bg-muted rounded px-2 py-1.5 font-mono truncate"
              />
              <Button size="sm" variant="outline" onClick={copyLink} title="Copiar link">
                {copiedLink ? <CheckSquare className="w-4 h-4 text-green-500" /> : <FileText className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold">{data?.totalReferrals ?? 0}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Convertidas</p>
          <p className="text-xl font-bold text-green-600">{data?.successfulReferrals ?? 0}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Bônus ganho</p>
          <p className="text-xl font-bold">{formatCurrency(data?.referralEarnings ?? 0)}</p>
        </Card>
      </div>

      {/* Referrals list */}
      {(data?.referrals ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma indicação registrada</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Histórico de indicações</p>
          {(data?.referrals ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{r.referredName ?? r.referredEmail ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : ""}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${STATUS_COLORS[r.status] ?? ""}`}>
                  {r.status === "pending" ? "Pendente" : r.status === "completed" || r.status === "converted" ? "Convertida" : "Expirada"}
                </p>
                {r.discountApplied && (
                  <p className="text-xs text-muted-foreground">Desconto: {formatCurrency(Number(r.discountAmount ?? 0))}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Client360ModalProps {
  open: boolean;
  onClose: () => void;
  clientId: string | null;
}

export function Client360Modal({ open, onClose, clientId }: Client360ModalProps) {
  const id = clientId ?? "";

  const { data: client, isLoading: loadingClient } = useGetClient(id, {
    query: { enabled: open && !!id },
  });

  const { data: reservations } = useListReservations(
    { clientId: id, limit: 20 },
    { query: { enabled: open && !!id } }
  );

  const { data: payments } = useListPayments(
    { clientId: id, limit: 20 },
    { query: { enabled: open && !!id } }
  );

  const { data: loyaltyInfo } = useGetClientLoyalty(id, {
    query: { enabled: open && !!id },
  });

  const { data: loyaltyMembers } = useListLoyaltyMembers({
    query: { enabled: open && !!id },
  });

  const { data: loyaltyTransactions } = useListLoyaltyTransactions({
    query: { enabled: open && !!id && !!loyaltyInfo?.memberId },
  });

  const member = useMemo(() => {
    if (!loyaltyMembers || !id) return null;
    return (loyaltyMembers as { id: string; clientId: string; tier: string; totalPoints: number; availablePoints: number; joinedAt: string }[]).find(m => m.clientId === id) ?? null;
  }, [loyaltyMembers, id]);

  const memberTransactions = useMemo(() => {
    const memberId = loyaltyInfo?.memberId ?? member?.id;
    if (!loyaltyTransactions || !memberId) return [];
    return (loyaltyTransactions as { id: string; memberId: string; type: string; points: number; description: string; createdAt: string }[])
      .filter(t => t.memberId === memberId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [loyaltyTransactions, loyaltyInfo, member]);

  const isOpen = open && !!id;

  return (
    <Dialog open={isOpen} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {loadingClient || !client ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-6 w-2/3" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-bold">
                  {client.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <DialogTitle className="text-left">{client.name}</DialogTitle>
                  <p className="text-sm text-muted-foreground">{client.email}</p>
                </div>
                {(() => {
                  const s = STATUS_LABELS[client.status];
                  return s ? <Badge className={`${s.color} border ml-auto`}>{s.label}</Badge> : null;
                })()}
              </div>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-3 py-2">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Valor Pago</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(client.totalSpent)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Saldo Devedor</p>
                <p className={`text-lg font-bold ${client.outstandingBalance > 0 ? "text-destructive" : "text-green-600"}`}>
                  {formatCurrency(client.outstandingBalance)}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">NPS</p>
                <p className="text-lg font-bold">{(client.companyNps ?? client.npsScore) != null ? `${client.companyNps ?? client.npsScore}/10` : "—"}</p>
              </Card>
            </div>

            <Tabs defaultValue="data">
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="data">Dados</TabsTrigger>
                <TabsTrigger value="trips">Viagens</TabsTrigger>
                <TabsTrigger value="financial">Financeiro</TabsTrigger>
                <TabsTrigger value="loyalty">Fidelidade</TabsTrigger>
                <TabsTrigger value="referral">Indicações</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
                <TabsTrigger value="documents">Docs</TabsTrigger>
              </TabsList>

              <TabsContent value="data" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "WhatsApp", value: client.whatsapp, icon: Phone },
                    { label: "E-mail", value: client.email, icon: Mail },
                    { label: "Cidade", value: client.addressCity ? `${client.addressCity}/${client.addressState}` : "—", icon: MapPin },
                    { label: "Aniversário", value: client.birthDate ? format(parseISO(client.birthDate), "dd/MM/yyyy", { locale: ptBR }) : "—", icon: Calendar },
                    { label: "CPF", value: client.cpf ?? "—", icon: null },
                    { label: "RG", value: client.rg ?? "—", icon: null },
                    { label: "Instagram", value: client.instagram ?? "—", icon: null },
                    { label: "Classificação", value: CLASSIFICATION_LABELS[client.classification] ?? client.classification, icon: null },
                    { label: "Pipeline", value: client.pipelineStage ?? "—", icon: null },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center gap-2">
                      {Icon && <Icon className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>
                    </div>
                  ))}
                </div>
                {(client.tags ?? []).length > 0 && (
                  <div><p className="text-xs text-muted-foreground mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">{client.tags.map(tag => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}</div>
                  </div>
                )}
                {(client.dreamDestinations ?? []).length > 0 && (
                  <div><p className="text-xs text-muted-foreground mb-1">Destinos Sonhados</p>
                    <div className="flex flex-wrap gap-1">{client.dreamDestinations.map(d => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}</div>
                  </div>
                )}
                {client.observations && (
                  <div><p className="text-xs text-muted-foreground mb-1">Observações</p>
                    <p className="text-sm bg-muted/50 rounded-lg p-3">{client.observations}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="trips" className="mt-4">
                {!reservations?.data.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma viagem encontrada.</p>
                ) : (
                  <div className="space-y-2">
                    {reservations.data.map(r => {
                      const birthDate = r.client?.birthDate ? new Date(r.client.birthDate) : null;
                      const ageYears = birthDate ? Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
                      const ageCategory = ageYears == null ? "adult" : ageYears < 12 ? "child" : ageYears >= 60 ? "senior" : "adult";
                      const ageCategoryLabel: Record<string, { label: string; color: string }> = {
                        child:  { label: "Criança", color: "bg-blue-100 text-blue-800" },
                        senior: { label: "Sênior",  color: "bg-purple-100 text-purple-800" },
                        adult:  { label: "Adulto",  color: "bg-gray-100 text-gray-700" },
                      };
                      const catInfo = ageCategoryLabel[ageCategory];
                      const firstSeat = r.seats?.[0] ?? null;
                      const paidForReservation = (payments?.data ?? [])
                        .filter(p => p.reservationId === r.id && p.status === "paid")
                        .reduce((sum, p) => sum + Number(p.amount), 0);
                      return (
                        <div key={r.id} className="p-3 rounded-lg border space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">{r.trip.name}</p>
                            <Badge
                              variant={r.status === "confirmed" || r.status === "completed" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {r.status === "confirmed" ? "Confirmada" : r.status === "pending" ? "Pendente" : r.status === "completed" ? "Concluída" : r.status === "cancelled" ? "Cancelada" : r.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{format(parseISO(r.trip.departureDate), "dd/MM/yyyy", { locale: ptBR })} · {r.seats.length} lugar(es)</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {firstSeat && (
                              <span className="font-mono text-xs bg-gray-100 border border-gray-300 px-2 py-0.5 rounded font-bold">Assento {firstSeat}</span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${catInfo.color}`}>{catInfo.label}</span>
                            {r.client?.cpf && (
                              <span className="text-xs text-muted-foreground">CPF: {r.client.cpf}</span>
                            )}
                          </div>
                          <p className="text-sm font-semibold">Valor do negócio: {formatCurrency(r.totalValue)}</p>
                          {paidForReservation > 0 && (
                            <p className="text-sm text-green-600 font-medium">Pago: {formatCurrency(paidForReservation)}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="financial" className="mt-4">
                {!payments?.data.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum pagamento encontrado.</p>
                ) : (
                  <div className="space-y-2">
                    {payments.data.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="font-medium text-sm">{p.description ?? p.category}</p>
                          <p className="text-xs text-muted-foreground">
                            Vence {format(parseISO(p.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                            {p.paidAt && ` · Pago ${format(parseISO(p.paidAt), "dd/MM/yyyy", { locale: ptBR })}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{formatCurrency(p.amount)}</p>
                          <Badge variant={p.status === "paid" ? "default" : p.status === "overdue" ? "destructive" : "secondary"} className="text-xs">
                            {p.status === "paid" ? "Pago" : p.status === "overdue" ? "Vencido" : "Pendente"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="loyalty" className="mt-4 space-y-4">
                {!loyaltyInfo && !member ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Gift className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">Cliente não inscrito no programa de fidelidade</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {loyaltyInfo && (
                        <Card className="p-4 space-y-1">
                          <p className="text-xs text-muted-foreground">Programa</p>
                          <p className="font-semibold">{loyaltyInfo.programName}</p>
                          <p className="text-xs text-muted-foreground mt-2">Pontos Disponíveis</p>
                          <p className="text-2xl font-bold text-primary">{loyaltyInfo.availablePoints.toLocaleString("pt-BR")}</p>
                          <p className="text-xs text-muted-foreground">≈ {formatCurrency(loyaltyInfo.availablePoints * loyaltyInfo.realPerPoint)}</p>
                        </Card>
                      )}
                      {member && (
                        <Card className="p-4 space-y-1">
                          <p className="text-xs text-muted-foreground">Tier</p>
                          {(() => {
                            const tier = TIER_LABELS[member.tier] ?? { label: member.tier, color: "bg-gray-100 text-gray-700" };
                            return (
                              <div className="flex items-center gap-2 mt-1">
                                <Award className="w-5 h-5 text-primary" />
                                <Badge className={`${tier.color} border font-semibold`}>{tier.label}</Badge>
                              </div>
                            );
                          })()}
                          <p className="text-xs text-muted-foreground mt-2">Total Acumulado</p>
                          <p className="text-xl font-bold">{member.totalPoints.toLocaleString("pt-BR")} pts</p>
                          <p className="text-xs text-muted-foreground">Membro desde {format(parseISO(member.joinedAt), "dd/MM/yyyy", { locale: ptBR })}</p>
                        </Card>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold mb-2">Histórico de Transações</p>
                      {memberTransactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma transação encontrada.</p>
                      ) : (
                        <div className="space-y-2">
                          {memberTransactions.slice(0, 20).map(t => (
                            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${t.type === "earn" || t.type === "bonus" ? "bg-green-100" : "bg-red-100"}`}>
                                  {t.type === "earn" || t.type === "bonus"
                                    ? <Star className="w-3.5 h-3.5 text-green-600" />
                                    : <TrendingUp className="w-3.5 h-3.5 text-red-500" />}
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{t.description}</p>
                                  <p className="text-xs text-muted-foreground">{format(parseISO(t.createdAt), "dd/MM/yyyy", { locale: ptBR })}</p>
                                </div>
                              </div>
                              <span className={`text-sm font-bold ${t.type === "earn" || t.type === "bonus" ? "text-green-600" : "text-red-600"}`}>
                                {t.type === "earn" || t.type === "bonus" ? "+" : "-"}{Math.abs(t.points)} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="referral" className="mt-4">
                <ClientReferralTab clientId={id} />
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <ClientHistoryTab clientId={id} isOpen={isOpen} />
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                <ClientDocumentsTab clientId={id} />
              </TabsContent>
            </Tabs>

            <div className="border-t pt-3 mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Valor Pago:</span>
                <span className="text-sm font-bold text-green-600">{formatCurrency(client.totalSpent)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">A Pagar:</span>
                <span className={`text-sm font-bold ${client.outstandingBalance > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {formatCurrency(client.outstandingBalance)}
                </span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
