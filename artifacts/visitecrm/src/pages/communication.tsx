import { useState } from "react";
import { useListMessages, useSendMessage, useListMessageTemplates, useCreateMessageTemplate, useDeleteMessageTemplate } from "@workspace/api-client-react";
import { useListClients } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Send, MessageSquare, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Communication() {
  const [tab, setTab] = useState("messages");
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [channel, setChannel] = useState("whatsapp");

  const { data: messages, isLoading: loadingMessages, refetch: refetchMessages } = useListMessages({ limit: 20 });
  const { data: templates, isLoading: loadingTemplates, refetch: refetchTemplates } = useListMessageTemplates();
  const { data: clients } = useListClients({ limit: 100 });
  const sendMessage = useSendMessage();
  const createTemplate = useCreateMessageTemplate();
  const deleteTemplate = useDeleteMessageTemplate();

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await sendMessage.mutateAsync({
      data: {
        toClientId: selectedClientId,
        channel: fd.get("channel") as string || "whatsapp",
        content: fd.get("content") as string,
      }
    });
    setIsSendOpen(false);
    refetchMessages();
  };

  const handleCreateTemplate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createTemplate.mutateAsync({
      data: {
        name: fd.get("name") as string,
        channel: fd.get("channel") as string || "whatsapp",
        subject: fd.get("subject") as string || undefined,
        content: fd.get("content") as string,
        category: fd.get("category") as string || undefined,
        variables: [],
      }
    });
    setIsTemplateOpen(false);
    refetchTemplates();
  };

  const handleDeleteTemplate = async (id: string) => {
    await deleteTemplate.mutateAsync({ id });
    refetchTemplates();
  };

  const channelColors: Record<string, string> = {
    whatsapp: "bg-green-100 text-green-800",
    email: "bg-blue-100 text-blue-800",
    sms: "bg-orange-100 text-orange-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comunicação</h1>
          <p className="text-muted-foreground mt-1">Envie mensagens e gerencie templates de comunicação.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isTemplateOpen} onOpenChange={setIsTemplateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="w-4 h-4 mr-2" /> Novo Template</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Criar Template</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateTemplate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome do Template</label>
                  <Input name="name" required placeholder="Ex: Confirmação de Reserva" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Canal</label>
                    <Select name="channel" defaultValue="whatsapp">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Categoria</label>
                    <Input name="category" placeholder="Ex: confirmacao" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assunto (E-mail)</label>
                  <Input name="subject" placeholder="Assunto do e-mail" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Conteúdo</label>
                  <Textarea name="content" required rows={5} placeholder="Olá {nome}, sua reserva foi confirmada..." />
                  <p className="text-xs text-muted-foreground">Use {"{nome}"}, {"{viagem}"}, {"{data}"} como variáveis.</p>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createTemplate.isPending}>
                    {createTemplate.isPending ? "Criando..." : "Criar Template"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={isSendOpen} onOpenChange={setIsSendOpen}>
            <DialogTrigger asChild>
              <Button><Send className="w-4 h-4 mr-2" /> Enviar Mensagem</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enviar Mensagem</DialogTitle></DialogHeader>
              <form onSubmit={handleSend} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cliente</label>
                  <Select onValueChange={setSelectedClientId} value={selectedClientId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar cliente..." /></SelectTrigger>
                    <SelectContent>
                      {clients?.data?.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Canal</label>
                  <Select name="channel" defaultValue="whatsapp">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mensagem</label>
                  <Textarea name="content" required rows={4} placeholder="Digite sua mensagem..." />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={sendMessage.isPending || !selectedClientId}>
                    {sendMessage.isPending ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="messages">Mensagens Enviadas</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="mt-4">
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingMessages ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : !messages || messages.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma mensagem enviada.</TableCell></TableRow>
                ) : messages.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{(m as any).clientName ?? "—"}</TableCell>
                    <TableCell><Badge className={channelColors[m.channel] ?? ""}>{m.channel}</Badge></TableCell>
                    <TableCell><p className="text-sm max-w-xs truncate">{m.content}</p></TableCell>
                    <TableCell><Badge variant="outline">{m.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.sentAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {loadingTemplates ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)
            ) : !templates || templates.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>Nenhum template criado. Crie o seu primeiro template de mensagem.</p>
              </div>
            ) : templates.map(t => (
              <Card key={t.id} className="group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold">{t.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge className={channelColors[t.channel] ?? ""}>{t.channel}</Badge>
                      <button
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {t.category && <p className="text-xs text-muted-foreground">{t.category}</p>}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">{t.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
