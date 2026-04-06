import { useState } from "react";
import {
  useListCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useListTrips,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Megaphone,
  Trash2,
  Send,
  Users,
  MailOpen,
  MousePointerClick,
  BarChart2,
  PackageCheck,
} from "lucide-react";
import type { Campaign } from "@workspace/api-client-react";

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  draft: { label: "Rascunho", className: "bg-gray-100 text-gray-800" },
  scheduled: { label: "Agendada", className: "bg-blue-100 text-blue-800" },
  sending: { label: "Enviando", className: "bg-yellow-100 text-yellow-800" },
  sent: { label: "Enviada", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelada", className: "bg-red-100 text-red-800" },
};

const typeLabels: Record<string, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Campaigns() {
  const [isOpen, setIsOpen] = useState(false);
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [campaignType, setCampaignType] = useState("email");
  const [segTripId, setSegTripId] = useState("__all__");

  const { data: campaigns, isLoading, refetch } = useListCampaigns();
  const { data: trips } = useListTrips({ limit: 100 });
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const seg: Record<string, string> = {};
    const city = (fd.get("seg_city") as string).trim();
    const origin = (fd.get("seg_origin") as string).trim();
    const tag = (fd.get("seg_tag") as string).trim();
    const pipeline = (fd.get("seg_pipeline") as string).trim();
    if (city) seg.city = city;
    if (origin) seg.origin = origin;
    if (tag) seg.tag = tag;
    if (pipeline) seg.pipelineStage = pipeline;
    if (segTripId && segTripId !== "__all__") seg.tripId = segTripId;
    await createCampaign.mutateAsync({
      data: {
        name: fd.get("name") as string,
        type: campaignType,
        subject: (fd.get("subject") as string) || undefined,
        content: fd.get("content") as string,
        targetSegment: seg,
        scheduledAt: fd.get("scheduledAt")
          ? (fd.get("scheduledAt") as string)
          : undefined,
      },
    });
    setIsOpen(false);
    setCampaignType("email");
    setSegTripId("__all__");
    refetch();
  };

  const handleSend = async (id: string) => {
    await updateCampaign.mutateAsync({ id, data: { status: "sending" } });
    refetch();
  };

  const handleDelete = async (id: string) => {
    await deleteCampaign.mutateAsync({ id });
    refetch();
  };

  const analyticsTarget: Campaign | undefined = analyticsId
    ? (campaigns ?? []).find((c) => c.id === analyticsId)
    : undefined;

  const getDelivered = (c: Campaign) =>
    ((c as Campaign & { deliveredCount?: number }).deliveredCount ?? 0);

  const totalRecipients = (campaigns ?? []).reduce(
    (s, c) => s + c.recipientsCount,
    0
  );
  const totalSent = (campaigns ?? []).reduce((s, c) => s + c.sentCount, 0);
  const totalDelivered = (campaigns ?? []).reduce((s, c) => s + getDelivered(c), 0);
  const totalOpened = (campaigns ?? []).reduce((s, c) => s + c.openedCount, 0);
  const avgOpen =
    totalDelivered > 0 ? ((totalOpened / totalDelivered) * 100).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campanhas</h1>
          <p className="text-muted-foreground mt-1">
            Envios em massa para segmentos de clientes.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Criar Campanha</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome da Campanha</label>
                <Input
                  name="name"
                  required
                  placeholder="Ex: Promoção de Julho — Pacotes Nordeste"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Canal</label>
                  <Select value={campaignType} onValueChange={setCampaignType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Agendar para</label>
                  <Input name="scheduledAt" type="datetime-local" />
                </div>
              </div>
              {campaignType === "email" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assunto</label>
                  <Input name="subject" placeholder="Assunto do e-mail" required />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Segmento Alvo</label>
                <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-muted/30">
                  <label className="text-xs font-medium text-muted-foreground col-span-2">
                    Filtrar por (opcional — deixe em branco para todos os clientes)
                  </label>
                  <Input name="seg_city" placeholder="Cidade" />
                  <Input name="seg_origin" placeholder="Origem" />
                  <Input name="seg_tag" placeholder="Tag" />
                  <Input name="seg_pipeline" placeholder="Estágio Pipeline" />
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Viagem específica
                    </label>
                    <Select value={segTripId} onValueChange={setSegTripId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar viagem (opcional)..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todas as viagens</SelectItem>
                        {(trips?.data ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} —{" "}
                            {new Date(t.departureDate).toLocaleDateString("pt-BR")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Conteúdo</label>
                <Textarea
                  name="content"
                  required
                  rows={5}
                  placeholder="Olá {nome}, temos uma oferta exclusiva para você..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createCampaign.isPending}>
                  {createCampaign.isPending ? "Criando..." : "Criar Campanha"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Megaphone}
          label="Campanhas"
          value={(campaigns ?? []).length}
          color="bg-blue-100 text-blue-700"
        />
        <StatCard
          icon={Users}
          label="Destinatários"
          value={totalRecipients.toLocaleString("pt-BR")}
          color="bg-purple-100 text-purple-700"
        />
        <StatCard
          icon={Send}
          label="Enviados"
          value={totalSent.toLocaleString("pt-BR")}
          color="bg-green-100 text-green-700"
        />
        <StatCard
          icon={PackageCheck}
          label="Entregues"
          value={totalDelivered.toLocaleString("pt-BR")}
          color="bg-teal-100 text-teal-700"
        />
        <StatCard
          icon={MailOpen}
          label="Taxa de Abertura"
          value={avgOpen === "—" ? "—" : `${avgOpen}%`}
          color="bg-orange-100 text-orange-700"
        />
      </div>

      {analyticsTarget && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 className="w-4 h-4" /> Análise: {analyticsTarget.name}
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAnalyticsId(null)}
              >
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                {
                  label: "Destinatários",
                  value: analyticsTarget.recipientsCount,
                  base: null,
                },
                {
                  label: "Enviados",
                  value: analyticsTarget.sentCount,
                  base: analyticsTarget.recipientsCount,
                },
                {
                  label: "Entregues",
                  value: getDelivered(analyticsTarget),
                  base: analyticsTarget.sentCount,
                },
                {
                  label: "Abertos",
                  value: analyticsTarget.openedCount,
                  base: getDelivered(analyticsTarget),
                },
                {
                  label: "Cliques",
                  value: analyticsTarget.clickedCount,
                  base: analyticsTarget.openedCount,
                },
              ].map(({ label, value, base }) => (
                <div key={label} className="text-center">
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  {base !== null && base > 0 && (
                    <p className="text-xs text-primary font-medium">
                      {((value / base) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Destinatários</TableHead>
              <TableHead className="text-right">Enviados</TableHead>
              <TableHead className="text-right">Entregues</TableHead>
              <TableHead className="text-right">Abertos</TableHead>
              <TableHead className="text-right">Cliques</TableHead>
              <TableHead>Agendado / Enviado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (campaigns ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Nenhuma campanha criada.</p>
                  <p className="text-sm mt-1">
                    Crie sua primeira campanha para engajar clientes em massa.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              (campaigns ?? []).map((c) => {
                const st = statusConfig[c.status] ?? {
                  label: c.status,
                  className: "",
                };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {typeLabels[c.type] ?? c.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={st.className} variant="secondary">
                        {st.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.recipientsCount}</TableCell>
                    <TableCell className="text-right">{c.sentCount}</TableCell>
                    <TableCell className="text-right">
                      {getDelivered(c)}
                      {c.sentCount > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({((getDelivered(c) / c.sentCount) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.openedCount}
                      {getDelivered(c) > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({((c.openedCount / getDelivered(c)) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.clickedCount}
                      {c.openedCount > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({((c.clickedCount / c.openedCount) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.sentAt
                        ? new Date(c.sentAt).toLocaleDateString("pt-BR")
                        : c.scheduledAt
                        ? new Date(c.scheduledAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setAnalyticsId(analyticsId === c.id ? null : c.id)
                          }
                          title="Ver análise"
                        >
                          <BarChart2 className="w-4 h-4" />
                        </Button>
                        {c.status === "draft" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSend(c.id)}
                            title="Enviar agora"
                          >
                            <Send className="w-4 h-4 text-primary" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(c.id)}
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
