import { useState } from "react";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from "@workspace/api-client-react";
import type { Product, CreateProductBody, UpdateProductBody } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, Search, Package } from "lucide-react";

const PRODUCT_TYPES = [
  "Seguro",
  "Transfer",
  "Passeio",
  "Ingresso",
  "Hospedagem",
  "Alimentação",
  "Kit",
  "Outro",
];

function fmtCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Produtos() {
  const { toast } = useToast();
  const { data: products = [], refetch } = useListProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Partial<CreateProductBody & UpdateProductBody>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.type.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setForm({ active: true, featured: false });
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      price: p.price,
      promotionalPrice: p.promotionalPrice ?? undefined,
      stock: p.stock ?? undefined,
      active: p.active,
      featured: p.featured,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        await updateProduct.mutateAsync({
          id: editing.id,
          data: {
            name: form.name ?? undefined,
            price: form.price ?? undefined,
            promotionalPrice: form.promotionalPrice ?? undefined,
            stock: form.stock ?? undefined,
            active: (form as UpdateProductBody).active ?? undefined,
            featured: (form as UpdateProductBody).featured ?? undefined,
          },
        });
        toast({ title: "Produto atualizado" });
      } else {
        if (!form.name || !(form as CreateProductBody).type || form.price == null) {
          toast({ title: "Preencha nome, tipo e preço", variant: "destructive" });
          return;
        }
        await createProduct.mutateAsync({
          data: {
            name: form.name!,
            type: (form as CreateProductBody).type!,
            price: form.price!,
            description: (form as CreateProductBody).description ?? undefined,
            promotionalPrice: form.promotionalPrice ?? undefined,
            stock: form.stock ?? undefined,
          },
        });
        toast({ title: "Produto criado" });
      }
      setModalOpen(false);
      refetch();
    } catch {
      toast({ title: "Erro ao salvar produto", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProduct.mutateAsync({ id });
      toast({ title: "Produto excluído" });
      setDeleteId(null);
      refetch();
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  async function handleToggle(p: Product, field: "active" | "featured") {
    try {
      await updateProduct.mutateAsync({
        id: p.id,
        data: { [field]: !p[field] },
      });
      refetch();
    } catch {
      toast({ title: "Erro ao atualizar produto", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">{products.length} produto(s) cadastrado(s)</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Produto
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, tipo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Preço Promo</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead>Destaque</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhum produto encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{fmtCurrency(p.price)}</TableCell>
                  <TableCell className="font-mono text-green-600">
                    {fmtCurrency(p.promotionalPrice)}
                  </TableCell>
                  <TableCell>{p.stock != null ? p.stock : "Ilimitado"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={p.active}
                      onCheckedChange={() => handleToggle(p, "active")}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={p.featured}
                      onCheckedChange={() => handleToggle(p, "featured")}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(p.id)}
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
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
                    value={(form as CreateProductBody).type ?? ""}
                    onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_TYPES.map((t) => (
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
                  <Label>Descrição</Label>
                  <Textarea
                    value={(form as CreateProductBody).description ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label>Preço (R$) *</Label>
                <Input
                  type="number"
                  value={form.price ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: Number(e.target.value) }))
                  }
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="space-y-1">
                <Label>Preço Promocional (R$)</Label>
                <Input
                  type="number"
                  value={form.promotionalPrice ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      promotionalPrice: Number(e.target.value) || undefined,
                    }))
                  }
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="space-y-1">
                <Label>Estoque (vazio = ilimitado)</Label>
                <Input
                  type="number"
                  value={form.stock ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, stock: Number(e.target.value) || undefined }))
                  }
                  min={0}
                />
              </div>
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="active"
                    checked={(form as UpdateProductBody).active ?? true}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                  />
                  <Label htmlFor="active">Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="featured"
                    checked={(form as UpdateProductBody).featured ?? false}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, featured: v }))}
                  />
                  <Label htmlFor="featured">Destaque</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createProduct.isPending || updateProduct.isPending}
            >
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Produto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir este produto?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={deleteProduct.isPending}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
