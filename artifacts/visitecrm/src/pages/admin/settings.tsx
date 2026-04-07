import { useState } from "react";
import {
  useFeatureFlags,
  useCreateFeatureFlag,
  useUpdateFeatureFlag,
  useDeleteFeatureFlag,
  type FeatureFlag,
} from "@/hooks/use-admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Plus, Trash2, Settings, Zap } from "lucide-react";

const EMPTY_FLAG = {
  key: "",
  name: "",
  description: "",
  enabled: false,
  rolloutPercent: 100,
};

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { data: flags = [], isLoading } = useFeatureFlags();
  const createFlag = useCreateFeatureFlag();
  const updateFlag = useUpdateFeatureFlag();
  const deleteFlag = useDeleteFeatureFlag();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FLAG);

  async function handleCreate() {
    if (!form.key || !form.name) {
      toast({ title: "Preencha chave e nome", variant: "destructive" });
      return;
    }
    try {
      await createFlag.mutateAsync(form);
      setShowCreate(false);
      setForm(EMPTY_FLAG);
      toast({ title: "Feature flag criada" });
    } catch {
      toast({ title: "Erro ao criar flag", variant: "destructive" });
    }
  }

  async function handleToggle(flag: FeatureFlag) {
    try {
      await updateFlag.mutateAsync({ id: flag.id, enabled: !flag.enabled });
    } catch {
      toast({ title: "Erro ao atualizar flag", variant: "destructive" });
    }
  }

  async function handleRollout(flag: FeatureFlag, percent: number) {
    try {
      await updateFlag.mutateAsync({ id: flag.id, rolloutPercent: percent });
    } catch {
      toast({ title: "Erro ao atualizar rollout", variant: "destructive" });
    }
  }

  async function handleDelete(flag: FeatureFlag) {
    if (!confirm(`Excluir a flag "${flag.name}"?`)) return;
    try {
      await deleteFlag.mutateAsync(flag.id);
      toast({ title: "Flag excluída" });
    } catch {
      toast({ title: "Erro ao excluir flag", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Configurações globais e feature flags da plataforma</p>
      </div>

      {/* Feature Flags Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-amber-500" />
                Feature Flags
              </CardTitle>
              <CardDescription className="mt-1">Ative ou desative funcionalidades da plataforma em tempo real</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Flag
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground animate-pulse">Carregando...</div>
          ) : flags.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma feature flag cadastrada.</p>
            </div>
          ) : (
            <div className="divide-y">
              {flags.map(flag => (
                <div key={flag.id} className="py-4 flex items-start gap-4">
                  <Switch
                    checked={flag.enabled}
                    onCheckedChange={() => handleToggle(flag)}
                    disabled={updateFlag.isPending}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{flag.name}</span>
                      <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{flag.key}</span>
                      <Badge variant={flag.enabled ? "default" : "secondary"} className="text-xs">
                        {flag.enabled ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    {flag.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">Rollout:</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={flag.rolloutPercent}
                        onChange={e => handleRollout(flag, Number(e.target.value))}
                        className="w-24 accent-primary"
                      />
                      <span className="text-xs font-medium">{flag.rolloutPercent}%</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDelete(flag)}
                    disabled={deleteFlag.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="w-4 h-4 text-muted-foreground" />
            Configurações da Plataforma
          </CardTitle>
          <CardDescription>Informações gerais do SaaS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Nome da Plataforma</Label>
              <Input defaultValue="VisiteCRM" className="h-8 text-sm" readOnly />
            </div>
            <div>
              <Label className="text-xs">Email de Suporte</Label>
              <Input defaultValue="suporte@visitecrm.com" className="h-8 text-sm" readOnly />
            </div>
            <div>
              <Label className="text-xs">URL da Plataforma</Label>
              <Input defaultValue="https://visite-crm.replit.app" className="h-8 text-sm" readOnly />
            </div>
            <div>
              <Label className="text-xs">Versão</Label>
              <Input defaultValue="2.0.0" className="h-8 text-sm" readOnly />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Configurações editáveis via variáveis de ambiente do servidor.</p>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Feature Flag</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Chave (key) *</Label>
                <Input value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s/g, "_") }))} className="h-8 text-sm font-mono" placeholder="ex: nova_feature" />
              </div>
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" placeholder="Ex: Nova Feature" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              <Label className="text-sm">Ativar imediatamente</Label>
            </div>
            <div>
              <Label className="text-xs">Rollout: {form.rolloutPercent}%</Label>
              <input
                type="range"
                min={0}
                max={100}
                value={form.rolloutPercent}
                onChange={e => setForm(f => ({ ...f, rolloutPercent: Number(e.target.value) }))}
                className="w-full accent-primary mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createFlag.isPending}>Criar Flag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
