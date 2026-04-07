import { useState } from "react";
import {
  useAdminPlans,
  useCreatePlan,
  useUpdatePlan,
  useDeletePlan,
  type AdminPlan,
} from "@/hooks/use-admin";
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
import { Plus, Pencil, Trash2, Star, Users, Building2 } from "lucide-react";

const EMPTY_PLAN = {
  name: "",
  slug: "",
  description: "",
  priceMonthly: "0",
  priceYearly: "0",
  maxUsers: 5,
  maxClients: 100,
  maxTrips: 50,
  features: [] as string[],
  isActive: true,
  isFeatured: false,
  sortOrder: 0,
};

type PlanForm = typeof EMPTY_PLAN;

function PlanDialog({
  open,
  onClose,
  initial,
  onSave,
  saving,
  title,
}: {
  open: boolean;
  onClose: () => void;
  initial: PlanForm;
  onSave: (data: PlanForm) => void;
  saving: boolean;
  title: string;
}) {
  const [form, setForm] = useState<PlanForm>(initial);
  const [featuresText, setFeaturesText] = useState(initial.features.join("\n"));

  function handleOpen() {
    setForm(initial);
    setFeaturesText(initial.features.join("\n"));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else handleOpen(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Slug</Label>
              <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className="h-8 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Preço Mensal (R$)</Label>
              <Input value={form.priceMonthly} onChange={e => setForm(f => ({ ...f, priceMonthly: e.target.value }))} className="h-8 text-sm" type="number" />
            </div>
            <div>
              <Label className="text-xs">Preço Anual (R$)</Label>
              <Input value={form.priceYearly} onChange={e => setForm(f => ({ ...f, priceYearly: e.target.value }))} className="h-8 text-sm" type="number" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Máx. Usuários</Label>
              <Input value={form.maxUsers} onChange={e => setForm(f => ({ ...f, maxUsers: Number(e.target.value) }))} className="h-8 text-sm" type="number" />
            </div>
            <div>
              <Label className="text-xs">Máx. Clientes</Label>
              <Input value={form.maxClients} onChange={e => setForm(f => ({ ...f, maxClients: Number(e.target.value) }))} className="h-8 text-sm" type="number" />
            </div>
            <div>
              <Label className="text-xs">Máx. Viagens</Label>
              <Input value={form.maxTrips} onChange={e => setForm(f => ({ ...f, maxTrips: Number(e.target.value) }))} className="h-8 text-sm" type="number" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Features (uma por linha)</Label>
            <textarea
              className="w-full border rounded-md text-sm p-2 min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              value={featuresText}
              onChange={e => {
                setFeaturesText(e.target.value);
                setForm(f => ({ ...f, features: e.target.value.split("\n").filter(Boolean) }));
              }}
              placeholder="Ex: Suporte por email"
            />
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
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(form)} disabled={saving || !form.name || !form.slug}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPlansPage() {
  const { data: plans = [], isLoading } = useAdminPlans();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const remove = useDeletePlan();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminPlan | null>(null);

  async function handleCreate(form: PlanForm) {
    try {
      await create.mutateAsync(form as never);
      setShowCreate(false);
      toast({ title: "Plano criado com sucesso" });
    } catch {
      toast({ title: "Erro ao criar plano", variant: "destructive" });
    }
  }

  async function handleUpdate(form: PlanForm) {
    if (!editTarget) return;
    try {
      await update.mutateAsync({ id: editTarget.id, ...form } as never);
      setEditTarget(null);
      toast({ title: "Plano atualizado" });
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  }

  async function handleDelete(plan: AdminPlan) {
    if (!confirm(`Excluir o plano "${plan.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove.mutateAsync(plan.id);
      toast({ title: "Plano excluído" });
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Carregando planos...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planos</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie os planos de assinatura da plataforma</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Plano
        </Button>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Nenhum plano cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className={plan.isFeatured ? "border-indigo-400 shadow-md" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                      {plan.isFeatured && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{plan.slug}</p>
                  </div>
                  <div className="flex gap-1">
                    <Badge variant={plan.isActive ? "default" : "secondary"} className="text-xs">
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.description && (
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                )}
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Mensal</span>
                    <p className="font-bold text-lg">
                      {Number(plan.priceMonthly) === 0 ? "Grátis" : `R$ ${Number(plan.priceMonthly).toLocaleString("pt-BR")}`}
                    </p>
                  </div>
                  {Number(plan.priceYearly) > 0 && (
                    <div>
                      <span className="text-muted-foreground text-xs">Anual</span>
                      <p className="font-semibold">R$ {Number(plan.priceYearly).toLocaleString("pt-BR")}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{plan.maxUsers} usuários</span>
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{plan.maxClients} clientes</span>
                </div>
                {plan.features.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {plan.features.slice(0, 4).map((f, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <span className="text-green-500">✓</span> {f}
                      </li>
                    ))}
                    {plan.features.length > 4 && (
                      <li className="text-muted-foreground/60">+{plan.features.length - 4} features</li>
                    )}
                  </ul>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {plan.tenantCount} {plan.tenantCount === 1 ? "agência" : "agências"}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditTarget(plan)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(plan)}
                      disabled={plan.tenantCount > 0}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PlanDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        initial={EMPTY_PLAN}
        onSave={handleCreate}
        saving={create.isPending}
        title="Novo Plano"
      />

      {editTarget && (
        <PlanDialog
          open={true}
          onClose={() => setEditTarget(null)}
          initial={{
            name: editTarget.name,
            slug: editTarget.slug,
            description: editTarget.description ?? "",
            priceMonthly: editTarget.priceMonthly,
            priceYearly: editTarget.priceYearly,
            maxUsers: editTarget.maxUsers,
            maxClients: editTarget.maxClients,
            maxTrips: editTarget.maxTrips,
            features: editTarget.features,
            isActive: editTarget.isActive,
            isFeatured: editTarget.isFeatured,
            sortOrder: editTarget.sortOrder,
          }}
          onSave={handleUpdate}
          saving={update.isPending}
          title={`Editar: ${editTarget.name}`}
        />
      )}
    </div>
  );
}
