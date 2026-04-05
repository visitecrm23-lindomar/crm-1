import { useState, useEffect } from "react";
import { useListPipelineStages, useListDeals, useCreateDeal, useMoveDeal, useDeleteDeal } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Pipeline() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const { data: stages, isLoading: loadingStages, refetch: refetchStages } = useListPipelineStages();
  const { data: deals, isLoading: loadingDeals, refetch: refetchDeals } = useListDeals({ status: "open" });

  useEffect(() => {
    if (!loadingStages && (!stages || stages.length === 0)) {
      const t = setTimeout(() => { refetchStages(); refetchDeals(); }, 2000);
      return () => clearTimeout(t);
    }
  }, [loadingStages, stages]);
  const createDeal = useCreateDeal();
  const moveDeal = useMoveDeal();
  const deleteDeal = useDeleteDeal();

  const dealsByStage = (stageId: string) => deals?.filter(d => d.stageId === stageId) ?? [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const stageId = stages?.[0]?.id ?? "";
    await createDeal.mutateAsync({
      data: {
        stageId,
        title: formData.get("title") as string,
        value: parseFloat(formData.get("value") as string || "0"),
        leadName: formData.get("leadName") as string || undefined,
        leadWhatsapp: formData.get("leadWhatsapp") as string || undefined,
        description: formData.get("description") as string || undefined,
      }
    });
    setIsCreateOpen(false);
    refetchDeals();
    refetchStages();
  };

  const handleDrop = async (stageId: string) => {
    if (draggingDealId && stageId) {
      await moveDeal.mutateAsync({ id: draggingDealId, data: { stageId } });
      refetchDeals();
      refetchStages();
    }
    setDraggingDealId(null);
    setDragOverStageId(null);
  };

  const handleDelete = async (dealId: string) => {
    await deleteDeal.mutateAsync({ id: dealId });
    refetchDeals();
    refetchStages();
  };

  if (loadingStages || loadingDeals) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-64 shrink-0 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline de Vendas</h1>
          <p className="text-muted-foreground mt-1">Acompanhe seus negócios em andamento.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Novo Negócio</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Negócio</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Título</label>
                <Input name="title" required placeholder="Ex: Excursão BH para Arraial" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome do Lead</label>
                <Input name="leadName" placeholder="Maria Silva" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">WhatsApp do Lead</label>
                <Input name="leadWhatsapp" placeholder="+55 31 99999-9999" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Valor Estimado (R$)</label>
                <Input name="value" type="number" step="0.01" placeholder="1500.00" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição</label>
                <Input name="description" placeholder="Detalhes do negócio..." />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createDeal.isPending}>
                  {createDeal.isPending ? "Criando..." : "Criar Negócio"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-6">
        {stages?.map((stage) => (
          <div
            key={stage.id}
            className={`w-72 shrink-0 flex flex-col gap-3 rounded-lg border p-3 transition-colors ${
              dragOverStageId === stage.id ? "bg-primary/5 border-primary" : "bg-muted/30"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOverStageId(stage.id); }}
            onDragLeave={() => setDragOverStageId(null)}
            onDrop={() => handleDrop(stage.id)}
          >
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-semibold">{stage.name}</span>
                <Badge variant="secondary" className="text-xs">{stage.dealsCount}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{formatCurrency(stage.dealsValue ?? 0)}</span>
            </div>

            <div className="flex flex-col gap-2 min-h-[100px]">
              {dealsByStage(stage.id).map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={() => setDraggingDealId(deal.id)}
                  onDragEnd={() => { setDraggingDealId(null); setDragOverStageId(null); }}
                  className="bg-card rounded-md border p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight">{deal.title}</p>
                      {deal.leadName && (
                        <p className="text-xs text-muted-foreground mt-0.5">{deal.leadName}</p>
                      )}
                      {deal.clientName && !deal.leadName && (
                        <p className="text-xs text-muted-foreground mt-0.5">{deal.clientName}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(deal.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-primary">{formatCurrency(deal.value)}</span>
                    {deal.leadWhatsapp && (
                      <span className="text-xs text-muted-foreground">{deal.leadWhatsapp}</span>
                    )}
                  </div>
                </div>
              ))}
              {dealsByStage(stage.id).length === 0 && (
                <div className="flex items-center justify-center h-16 rounded-md border-2 border-dashed text-xs text-muted-foreground">
                  Arraste negócios aqui
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
