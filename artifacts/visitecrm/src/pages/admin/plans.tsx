import { useState } from "react";
import {
  useListPlans,
  useCreatePlan,
  useUpdatePlan,
  useArchivePlan,
  type Plan,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Archive, CheckCircle2, Star, Users, Building2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPlansQueryKey } from "@workspace/api-client-react";

interface PlanFormData {
  name: string;
  slug: string;
  description: string;
  monthlyPrice: string;
  annualPrice: string;
  maxUsers: number;
  maxClients: number;
  maxTrips: number;
  features: string;
  isActive: boolean;
  isFeatured: boolean;
}

const DEFAULT_FORM: PlanFormData = {
  name: "",
  slug: "",
  description: "",
  monthlyPrice: "0",
  annualPrice: "0",
  maxUsers: 5,
  maxClients: 100,
  maxTrips: 20,
  features: "",
  isActive: true,
  isFeatured: false,
};

interface PlanModalProps {
  plan: Plan | null;
  onClose: () => void;
}

function PlanModal({ plan, onClose }: PlanModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();

  const [form, setForm] = useState<PlanFormData>(
    plan
      ? {
          name: plan.name,
          slug: plan.slug,
          description: plan.description ?? "",
          monthlyPrice: plan.monthlyPrice,
          annualPrice: plan.annualPrice,
          maxUsers: plan.maxUsers,
          maxClients: plan.maxClients,
          maxTrips: plan.maxTrips,
          features: (plan.features ?? []).join(", "),
          isActive: plan.isActive,
          isFeatured: plan.isFeatured,
        }
      : DEFAULT_FORM
  );

  const isLoading = createPlan.isPending || updatePlan.isPending;

  async function handleSave() {
    const data = {
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      monthlyPrice: form.monthlyPrice,
      annualPrice: form.annualPrice,
      maxUsers: form.maxUsers,
      maxClients: form.maxClients,
      maxTrips: form.maxTrips,
      features: form.features ? form.features.split(",").map((f) => f.trim()).filter(Boolean) : [],
      isActive: form.isActive,
      isFeatured: form.isFeatured,
    };
    try {
      if (plan) {
        await updatePlan.mutateAsync({ id: plan.id, data });
      } else {
        await createPlan.mutateAsync({ data });
      }
      await queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
      toast({ title: plan ? "Plano atualizado" : "Plano criado com sucesso" });
      onClose();
    } catch {
      toast({ title: "Erro ao salvar plano", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pro" />
            </div>
            <div>
              <Label className="text-sm font-medium">Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="pro" />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Descrição</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Para agências em crescimento" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Preço Mensal (R$)</Label>
              <Input type="number" value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })} />
            </div>
            <div>
              <Label className="text-sm font-medium">Preço Anual (R$)</Label>
              <Input type="number" value={form.annualPrice} onChange={(e) => setForm({ ...form, annualPrice: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-sm font-medium">Máx. Usuários</Label>
              <Input type="number" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <Label className="text-sm font-medium">Máx. Clientes</Label>
              <Input type="number" value={form.maxClients} onChange={(e) => setForm({ ...form, maxClients: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <Label className="text-sm font-medium">Máx. Viagens</Label>
              <Input type="number" value={form.maxTrips} onChange={(e) => setForm({ ...form, maxTrips: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Features (separadas por vírgula)</Label>
            <Input value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder="CRM, Relatórios, API" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label className="text-sm">Ativo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isFeatured} onCheckedChange={v => setForm(f => ({ ...f, isFeatured: v }))} />
              <Label className="text-sm">Destaque</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isLoading || !form.name || !form.slug}>
            {isLoading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPlans() {
  const { data: plans = [], isLoading } = useListPlans();
  const archivePlan = useArchivePlan();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [modalPlan, setModalPlan] = useState<Plan | null | "new">(null);

  async function handleArchive(id: string) {
    try {
      await archivePlan.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
      toast({ title: "Plano arquivado" });
    } catch {
      toast({ title: "Erro ao arquivar plano", variant: "destructive" });
    }
  }

  function formatPrice(price: string) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(price));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planos</h1>
          <p className="text-muted-foreground text-sm mt-1">{plans.length} plano{plans.length !== 1 ? "s" : ""} cadastrado{plans.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setModalPlan("new")}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Plano
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-pulse text-muted-foreground">Carregando planos...</div>
            </div>
          ) : plans.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-muted-foreground">Nenhum plano cadastrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plano</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Preço Mensal</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Preço Anual</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Limites</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium flex items-center gap-2">
                          {plan.name}
                          {plan.isFeatured && <Badge variant="secondary" className="text-xs">Destaque</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{plan.slug}</div>
                      </td>
                      <td className="px-4 py-3">{formatPrice(plan.monthlyPrice)}/mês</td>
                      <td className="px-4 py-3">{formatPrice(plan.annualPrice)}/ano</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {plan.maxUsers} usuários · {plan.maxClients} clientes · {plan.maxTrips} viagens
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={plan.isActive ? "default" : "secondary"}>
                          {plan.isActive ? "Ativo" : "Arquivado"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setModalPlan(plan)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleArchive(plan.id)}
                            disabled={archivePlan.isPending}
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {modalPlan && (
        <PlanModal
          plan={modalPlan === "new" ? null : modalPlan}
          onClose={() => setModalPlan(null)}
        />
      )}
    </div>
  );
}
