import { useState } from "react";
import {
  useListAutomations,
  useCreateAutomation,
  useUpdateAutomation,
  useToggleAutomation,
  useDeleteAutomation,
  useListAutomationActions,
  useCreateAutomationAction,
  useDeleteAutomationAction,
  useListAutomationLogs,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Zap,
  Trash2,
  PlayCircle,
  ChevronRight,
  Settings2,
  ScrollText,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import type { Automation } from "@workspace/api-client-react";

const triggerLabels: Record<string, string> = {
  new_client: "Novo Cliente Cadastrado",
  payment_pending: "Pagamento Pendente",
  birthday: "Aniversário do Cliente",
  reservation_created: "Reserva Criada",
  pipeline_stage_changed: "Mudança de Estágio no Pipeline",
  trip_approaching: "Viagem se Aproximando",
  post_trip: "Pós-Viagem",
  nps_request: "Pesquisa NPS",
  payment_received: "Pagamento Recebido",
  trip_departure: "Saída de Viagem",
  checkin: "Check-in Realizado",
  trip_completed: "Viagem Concluída",
};

const actionTypeLabels: Record<string, string> = {
  send_whatsapp: "Enviar WhatsApp",
  send_email: "Enviar E-mail",
  change_pipeline_stage: "Alterar Estágio Pipeline",
  add_tag: "Adicionar Tag",
  create_task: "Criar Tarefa",
  send_sms: "Enviar SMS",
};

const logStatusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> =
  {
    success: {
      label: "Sucesso",
      icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
      className: "text-green-700 bg-green-50",
    },
    failed: {
      label: "Falhou",
      icon: <XCircle className="w-4 h-4 text-red-500" />,
      className: "text-red-700 bg-red-50",
    },
    running: {
      label: "Executando",
      icon: <Clock className="w-4 h-4 text-yellow-500" />,
      className: "text-yellow-700 bg-yellow-50",
    },
  };

type Condition = { field: string; operator: string; value: string };

const conditionFields = [
  { value: "client.tag", label: "Tag do cliente" },
  { value: "client.city", label: "Cidade do cliente" },
  { value: "trip.name", label: "Nome da viagem" },
  { value: "payment.status", label: "Status do pagamento" },
  { value: "pipeline.stage", label: "Estágio do Pipeline" },
  { value: "days_before_trip", label: "Dias antes da viagem" },
];

const conditionOperators = [
  { value: "equals", label: "é igual a" },
  { value: "not_equals", label: "é diferente de" },
  { value: "contains", label: "contém" },
  { value: "greater_than", label: "maior que" },
  { value: "less_than", label: "menor que" },
];

function AutomationDetail({
  automation,
  onClose,
  onUpdated,
}: {
  automation: Automation;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [actionType, setActionType] = useState("send_whatsapp");
  const [actionConfig, setActionConfig] = useState("");
  const storedConditions =
    automation.triggerConfig &&
    typeof automation.triggerConfig === "object" &&
    "conditions" in automation.triggerConfig &&
    Array.isArray((automation.triggerConfig as Record<string, unknown>).conditions)
      ? ((automation.triggerConfig as Record<string, unknown>).conditions as Condition[])
      : [];
  const [conditions, setConditions] = useState<Condition[]>(storedConditions);
  const [condField, setCondField] = useState("client.tag");
  const [condOp, setCondOp] = useState("equals");
  const [condVal, setCondVal] = useState("");

  const { data: allActions, refetch: refetchActions } = useListAutomationActions();
  const { data: allLogs } = useListAutomationLogs();

  const actions = (allActions ?? []).filter(
    (a) => a.automationId === automation.id
  );
  const logs = (allLogs ?? []).filter(
    (l) => l.automationId === automation.id
  );

  const createAction = useCreateAutomationAction();
  const deleteAction = useDeleteAutomationAction();
  const updateAutomation = useUpdateAutomation();

  const handleAddAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await createAction.mutateAsync({
      data: {
        automationId: automation.id,
        type: actionType,
        config: actionConfig ? { message: actionConfig } : {},
        order: (actions ?? []).length + 1,
      },
    });
    setActionConfig("");
    refetchActions();
  };

  const handleDeleteAction = async (id: string) => {
    await deleteAction.mutateAsync({ id });
    refetchActions();
  };

  const saveConditions = (newConds: Condition[]) => {
    const existingConfig =
      automation.triggerConfig && typeof automation.triggerConfig === "object"
        ? (automation.triggerConfig as Record<string, unknown>)
        : {};
    updateAutomation.mutateAsync({
      id: automation.id,
      data: {
        triggerConfig: { ...existingConfig, conditions: newConds },
      },
    }).then(onUpdated);
  };

  const handleAddCondition = () => {
    if (!condVal.trim()) return;
    const newConds = [
      ...conditions,
      { field: condField, operator: condOp, value: condVal.trim() },
    ];
    setConditions(newConds);
    setCondVal("");
    saveConditions(newConds);
  };

  const handleRemoveCondition = (idx: number) => {
    const newConds = conditions.filter((_, i) => i !== idx);
    setConditions(newConds);
    saveConditions(newConds);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          {automation.name}
        </DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="actions">
        <TabsList className="mb-4">
          <TabsTrigger value="actions">
            <Settings2 className="w-4 h-4 mr-1.5" /> Ações
          </TabsTrigger>
          <TabsTrigger value="conditions">
            <ChevronRight className="w-4 h-4 mr-1.5" /> Condições
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="w-4 h-4 mr-1.5" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
            <Zap className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-medium">Gatilho:</span>
            <span className="text-sm text-muted-foreground">
              {triggerLabels[automation.triggerType] ?? automation.triggerType}
            </span>
          </div>

          {(actions ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Sequência de ações</p>
              {(actions ?? []).map((a, i) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {actionTypeLabels[a.type] ?? a.type}
                    </p>
                    {a.config && typeof a.config === "object" && "message" in a.config && (
                      <p className="text-xs text-muted-foreground truncate">
                        {String(a.config.message)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteAction(a.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddAction} className="space-y-3 pt-2 border-t">
            <p className="text-sm font-medium">Adicionar Ação</p>
            <div className="grid grid-cols-2 gap-3">
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(actionTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={actionConfig}
                onChange={(e) => setActionConfig(e.target.value)}
                placeholder="Conteúdo / valor"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Fechar
              </Button>
              <Button type="submit" size="sm" disabled={createAction.isPending}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                {createAction.isPending ? "Adicionando..." : "Adicionar Ação"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="conditions" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Condições adicionais para controlar quando esta automação será disparada.
            Deixe em branco para disparar sempre que o gatilho ocorrer.
          </p>

          {conditions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Condições configuradas</p>
              {conditions.map((cond, idx) => {
                const fieldLabel = conditionFields.find((f) => f.value === cond.field)?.label ?? cond.field;
                const opLabel = conditionOperators.find((o) => o.value === cond.operator)?.label ?? cond.operator;
                return (
                  <div key={idx} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
                    <div className="flex-1 text-sm">
                      <span className="font-medium">{fieldLabel}</span>{" "}
                      <span className="text-muted-foreground">{opLabel}</span>{" "}
                      <span className="font-medium text-primary">"{cond.value}"</span>
                    </div>
                    <button
                      onClick={() => handleRemoveCondition(idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 border rounded-lg bg-muted/20 text-muted-foreground text-sm">
              Nenhuma condição adicional configurada — a automação dispara sempre que o gatilho ocorrer.
            </div>
          )}

          <div className="space-y-3 pt-2 border-t">
            <p className="text-sm font-medium">Adicionar Condição</p>
            <div className="grid grid-cols-3 gap-2">
              <Select value={condField} onValueChange={setCondField}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {conditionFields.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={condOp} onValueChange={setCondOp}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {conditionOperators.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={condVal}
                onChange={(e) => setCondVal(e.target.value)}
                placeholder="Valor"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Fechar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAddCondition}
                disabled={!condVal.trim() || updateAutomation.isPending}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar Condição
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          {!logs || (logs ?? []).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma execução registrada ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Executado em</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logs ?? []).map((log) => {
                  const st = logStatusConfig[log.status] ?? {
                    label: log.status,
                    icon: null,
                    className: "",
                  };
                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <span
                          className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full w-fit ${st.className}`}
                        >
                          {st.icon}
                          {st.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(log.executedAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-red-500 max-w-xs truncate">
                        {log.errorMessage ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

export default function Automations() {
  const [isOpen, setIsOpen] = useState(false);
  const [detailAutomation, setDetailAutomation] = useState<Automation | null>(null);
  const [triggerType, setTriggerType] = useState("reservation_created");

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
        description: (fd.get("description") as string) || undefined,
        triggerType,
        triggerConfig: {},
      },
    });
    setIsOpen(false);
    setTriggerType("reservation_created");
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

  const activeCount = (automations ?? []).filter((a) => a.isActive).length;
  const totalExecutions = (automations ?? []).reduce(
    (s, a) => s + a.executionsCount,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automações</h1>
          <p className="text-muted-foreground mt-1">
            Configure regras automáticas para economizar tempo no dia a dia.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Nova Automação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Automação</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome</label>
                <Input
                  name="name"
                  required
                  placeholder="Ex: Confirmação de reserva via WhatsApp"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Gatilho (Trigger)</label>
                <Select value={triggerType} onValueChange={setTriggerType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(triggerLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição (opcional)</label>
                <Textarea
                  name="description"
                  rows={3}
                  placeholder="O que essa automação faz?"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createAutomation.isPending}>
                  {createAutomation.isPending ? "Criando..." : "Criar Automação"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{(automations ?? []).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-700">
                <PlayCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ativas</p>
                <p className="text-xl font-bold">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                <ScrollText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Execuções</p>
                <p className="text-xl font-bold">{totalExecutions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !automations || automations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg bg-card">
          <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">Nenhuma automação configurada</p>
          <p className="text-sm mt-1">
            Crie automações para automatizar comunicações com clientes.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {automations.map((a) => (
            <Card key={a.id} className={a.isActive ? "" : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{a.name}</CardTitle>
                    {a.description && (
                      <CardDescription className="mt-0.5 line-clamp-1">
                        {a.description}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={a.isActive}
                      onCheckedChange={() => handleToggle(a.id)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Zap className="w-3 h-3 mr-1" />
                      {triggerLabels[a.triggerType] ?? a.triggerType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {a.executionsCount} execuções
                    </span>
                    {a.lastExecutedAt && (
                      <span className="text-xs text-muted-foreground">
                        Última:{" "}
                        {new Date(a.lastExecutedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Dialog
                      open={detailAutomation?.id === a.id}
                      onOpenChange={(o) => !o && setDetailAutomation(null)}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailAutomation(a)}
                        >
                          <Settings2 className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      {detailAutomation?.id === a.id && (
                        <AutomationDetail
                          automation={a}
                          onClose={() => setDetailAutomation(null)}
                          onUpdated={() => refetch()}
                        />
                      )}
                    </Dialog>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(a.id)}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
