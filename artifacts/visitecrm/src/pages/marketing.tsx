import { useState } from "react";
import { useListCampaigns, useCreateCampaign, useDeleteCampaign, useGetNpsSummary, useListNpsResponses } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Megaphone, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  scheduled: "bg-blue-100 text-blue-800",
  sent: "bg-green-100 text-green-800",
  sending: "bg-yellow-100 text-yellow-800",
};

const npsClassColors: Record<string, { badge: string; icon: any; label: string }> = {
  promoter: { badge: "bg-green-100 text-green-800", icon: TrendingUp, label: "Promotor" },
  passive: { badge: "bg-yellow-100 text-yellow-800", icon: Minus, label: "Neutro" },
  detractor: { badge: "bg-red-100 text-red-800", icon: TrendingDown, label: "Detrator" },
};

export default function Marketing() {
  const [tab, setTab] = useState("campaigns");
  const [isOpen, setIsOpen] = useState(false);

  const { data: campaigns, isLoading: loadingCampaigns, refetch: refetchCampaigns } = useListCampaigns();
  const { data: npsSummary, isLoading: loadingNps } = useGetNpsSummary();
  const { data: npsResponses, isLoading: loadingNpsResponses } = useListNpsResponses({ limit: 20 });

  const createCampaign = useCreateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createCampaign.mutateAsync({
      data: {
        name: fd.get("name") as string,
        type: fd.get("type") as string || "email",
        subject: fd.get("subject") as string || undefined,
        content: fd.get("content") as string,
        targetSegment: {},
        scheduledAt: fd.get("scheduledAt") ? (fd.get("scheduledAt") as string) : undefined,
      }
    });
    setIsOpen(false);
    refetchCampaigns();
  };

  const handleDelete = async (id: string) => {
    await deleteCampaign.mutateAsync({ id });
    refetchCampaigns();
  };

  const npsScore = npsSummary?.npsScore ?? 0;
  const npsColor = npsScore >= 50 ? "text-green-600" : npsScore >= 0 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
          <p className="text-muted-foreground mt-1">Campanhas, NPS e fidelização de clientes.</p>
        </div>
        {tab === "campaigns" && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Nova Campanha</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Criar Campanha</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome da Campanha</label>
                  <Input name="name" required placeholder="Ex: Promoção Fim de Ano" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tipo</label>
                    <Select name="type" defaultValue="email">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Agendamento</label>
                    <Input name="scheduledAt" type="datetime-local" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assunto (E-mail)</label>
                  <Input name="subject" placeholder="Assunto do e-mail" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Conteúdo</label>
                  <Textarea name="content" required rows={5} placeholder="Conteúdo da campanha..." />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createCampaign.isPending}>
                    {createCampaign.isPending ? "Criando..." : "Criar Campanha"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          <TabsTrigger value="nps">NPS</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          {loadingCampaigns ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
            </div>
          ) : !campaigns || campaigns.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Megaphone className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Nenhuma campanha criada</p>
              <p className="text-sm mt-1">Crie sua primeira campanha de marketing.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {campaigns.map(c => (
                <Card key={c.id} className="group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{c.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{c.type}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColors[c.status] ?? ""}>{c.status}</Badge>
                        <button onClick={() => handleDelete(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{c.recipientsCount} destinatários</span>
                      <span>{c.sentCount} enviados</span>
                      <span>{c.openedCount} abertos</span>
                    </div>
                    {c.scheduledAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Agendado: {new Date(c.scheduledAt).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="nps" className="mt-4 space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Score NPS</CardTitle></CardHeader>
              <CardContent>
                {loadingNps ? <Skeleton className="h-12 w-20" /> : (
                  <div className={`text-4xl font-bold ${npsColor}`}>{npsScore}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Promotores</CardTitle></CardHeader>
              <CardContent>
                {loadingNps ? <Skeleton className="h-8 w-16" /> : (
                  <div className="text-2xl font-bold text-green-600">{npsSummary?.promoters ?? 0}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Neutros</CardTitle></CardHeader>
              <CardContent>
                {loadingNps ? <Skeleton className="h-8 w-16" /> : (
                  <div className="text-2xl font-bold text-yellow-600">{npsSummary?.passives ?? 0}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Detratores</CardTitle></CardHeader>
              <CardContent>
                {loadingNps ? <Skeleton className="h-8 w-16" /> : (
                  <div className="text-2xl font-bold text-red-600">{npsSummary?.detractors ?? 0}</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pontuação</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead>Comentário</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingNpsResponses ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : !npsResponses || npsResponses.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhuma resposta NPS.</TableCell></TableRow>
                ) : npsResponses.map(r => {
                  const cls = npsClassColors[r.classification] ?? { badge: "bg-gray-100 text-gray-800", icon: Minus, label: r.classification };
                  const Icon = cls.icon;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-primary/10 text-primary">
                          {r.score}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cls.badge}>
                          <Icon className="w-3 h-3 mr-1" />{cls.label}
                        </Badge>
                      </TableCell>
                      <TableCell><p className="text-sm text-muted-foreground max-w-xs truncate">{r.feedback || "—"}</p></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
