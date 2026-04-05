import { useState } from "react";
import { useListAutomations, useCreateAutomation, useToggleAutomation, useDeleteAutomation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Zap, Trash2, Play, Pause } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const triggerLabels: Record<string, string> = {
  reservation_created: "Reserva Criada",
  payment_received: "Pagamento Recebido",
  trip_departure: "Saída de Viagem",
  birthday: "Aniversário do Cliente",
  checkin: "Check-in Realizado",
  trip_completed: "Viagem Concluída",
};

export default function Automations() {
  const [isOpen, setIsOpen] = useState(false);

  const { data: automations, isLoading, refetch } = useListAutomations();
  const createAutomation = useCreateAutomation();
  const toggleAutomation = useToggleAutomation();
  const deleteAutomation = useDeleteAutomation();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createAutomation.mutateAsync({
      data: {
        name: fd.get("name") as string,
        description: fd.get("description") as string || undefined,
        triggerType: fd.get("triggerType") as string,
        triggerConfig: {},
      }
    });
    setIsOpen(false);
    refetch();
  };

  const handleToggle = async (id: string) => {
    await toggleAutomation.mutateAsync({ id });
    refetch();
  };

  const handleDelete = async (id: string) => {
    await deleteAutomation.mutateAsync({ id });
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automações</h1>
          <p className="text-muted-foreground mt-1">Configure regras automáticas para sua agência.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Nova Automação</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Automação</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome</label>
                <Input name="name" required placeholder="Ex: Confirmação de reserva via WhatsApp" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Gatilho (Trigger)</label>
                <Select name="triggerType" defaultValue="reservation_created">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(triggerLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição</label>
                <Textarea name="description" rows={3} placeholder="O que essa automação faz?" />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={createAutomation.isPending}>
                  {createAutomation.isPending ? "Criando..." : "Criar Automação"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : !automations || automations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">Nenhuma automação configurada</p>
          <p className="text-sm mt-1">Crie automações para economizar tempo no dia a dia.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {automations.map(a => (
            <Card key={a.id} className={a.isActive ? "" : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-base">{a.name}</CardTitle>
                    {a.description && <CardDescription className="mt-1">{a.description}</CardDescription>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={a.isActive}
                      onCheckedChange={() => handleToggle(a.id)}
                    />
                    <button onClick={() => handleDelete(a.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Badge variant="outline">
                    <Zap className="w-3 h-3 mr-1" />
                    {triggerLabels[a.triggerType] ?? a.triggerType}
                  </Badge>
                  <span>{a.executionsCount} execuções</span>
                  {a.lastExecutedAt && (
                    <span>Última: {new Date(a.lastExecutedAt).toLocaleDateString("pt-BR")}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
