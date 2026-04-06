import { useState } from "react";
import {
  useListSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
} from "@workspace/api-client-react";
import type { Supplier, CreateSupplierBody, UpdateSupplierBody } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

const SUPPLIER_TYPES = ["Transporte", "Hospedagem", "Alimentação", "Guia", "Seguro", "Outro"];
const STATUS_OPTIONS = ["active", "inactive"];

const statusLabel: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export default function Fornecedores() {
  const { toast } = useToast();
  const { data: suppliers = [], refetch } = useListSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<CreateSupplierBody & UpdateSupplierBody>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.cnpj ?? "").includes(search) ||
      (s.addressCity ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setForm({});
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      contactName: s.contactName ?? "",
      email: s.email ?? "",
      pixKey: s.pixKey ?? "",
      status: s.status,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        await updateSupplier.mutateAsync({ id: editing.id, data: form as UpdateSupplierBody });
        toast({ title: "Fornecedor atualizado" });
      } else {
        if (!form.name || !form.type) {
          toast({ title: "Preencha nome e tipo", variant: "destructive" });
          return;
        }
        await createSupplier.mutateAsync({ data: form as CreateSupplierBody });
        toast({ title: "Fornecedor criado" });
      }
      setModalOpen(false);
      refetch();
    } catch {
      toast({ title: "Erro ao salvar fornecedor", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSupplier.mutateAsync({ id });
      toast({ title: "Fornecedor excluído" });
      setDeleteId(null);
      refetch();
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} fornecedor(es) cadastrado(s)</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Fornecedor
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, CNPJ, cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>PIX</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  Nenhum fornecedor encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.type}</TableCell>
                  <TableCell>{s.cnpj ?? "—"}</TableCell>
                  <TableCell>{s.contactName ?? "—"}</TableCell>
                  <TableCell>{s.whatsapp ?? "—"}</TableCell>
                  <TableCell>
                    {s.addressCity && s.addressState
                      ? `${s.addressCity}/${s.addressState}`
                      : s.addressCity ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.pixKey ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>
                      {statusLabel[s.status] ?? s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(s.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Nome *</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              {!editing && (
                <div className="col-span-2 space-y-1">
                  <Label>Tipo *</Label>
                  <Select
                    value={(form as CreateSupplierBody).type ?? ""}
                    onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPLIER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!editing && (
                <div className="col-span-2 space-y-1">
                  <Label>CNPJ</Label>
                  <Input
                    value={(form as CreateSupplierBody).cnpj ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label>Nome do Contato</Label>
                <Input
                  value={form.contactName ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input
                  value={form.email ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              {!editing && (
                <div className="space-y-1">
                  <Label>WhatsApp</Label>
                  <Input
                    value={(form as CreateSupplierBody).whatsapp ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                  />
                </div>
              )}
              {!editing && (
                <div className="space-y-1">
                  <Label>Cidade</Label>
                  <Input
                    value={(form as CreateSupplierBody).addressCity ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, addressCity: e.target.value }))}
                  />
                </div>
              )}
              {!editing && (
                <div className="space-y-1">
                  <Label>Estado (UF)</Label>
                  <Input
                    value={(form as CreateSupplierBody).addressState ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, addressState: e.target.value }))}
                    maxLength={2}
                    className="uppercase"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label>Chave PIX</Label>
                <Input
                  value={form.pixKey ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, pixKey: e.target.value }))}
                />
              </div>
              {editing && (
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={(form as UpdateSupplierBody).status ?? "active"}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={createSupplier.isPending || updateSupplier.isPending}>
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Fornecedor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir este fornecedor? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={deleteSupplier.isPending}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
