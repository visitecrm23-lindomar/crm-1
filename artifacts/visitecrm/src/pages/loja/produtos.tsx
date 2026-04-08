import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { storeApi, StoreProduct, StoreCategory, ProductInput } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Eye,
  EyeOff,
  Star,
} from "lucide-react";

function ProductForm({
  product,
  categories,
  onSave,
  onClose,
}: {
  product?: StoreProduct;
  categories: StoreCategory[];
  onSave: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ProductInput>({
    name: product?.name ?? "",
    type: product?.type ?? "package",
    categoryId: product?.categoryId ?? undefined,
    shortDescription: product?.shortDescription ?? "",
    description: product?.description ?? "",
    price: product?.price ? parseFloat(product.price) : 0,
    salePrice: product?.salePrice ? parseFloat(product.salePrice) : undefined,
    stock: product?.stock ?? undefined,
    destination: product?.destination ?? "",
    departureDate: product?.departureDate ?? "",
    returnDate: product?.returnDate ?? "",
    duration: product?.duration ?? undefined,
    images: product?.images ?? [],
    features: product?.features ?? [],
    includes: product?.includes ?? [],
    excludes: product?.excludes ?? [],
    isPublished: product?.isPublished ?? false,
    isFeatured: product?.isFeatured ?? false,
    status: product?.status ?? "draft",
  });

  function set(field: string, value: unknown) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleSave() {
    if (!form.name) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (product) {
        await storeApi.updateProduct(product.id, form);
      } else {
        await storeApi.createProduct(form);
      }
      toast({ title: product ? "Produto atualizado!" : "Produto criado!" });
      onSave();
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar produto",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function listEdit(field: "features" | "includes" | "excludes" | "images", value: string) {
    set(field, value.split("\n").filter(Boolean));
  }

  return (
    <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>Nome *</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={form.type ?? "package"} onValueChange={(v) => set("type", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="package">Pacote de Viagem</SelectItem>
              <SelectItem value="product">Produto</SelectItem>
              <SelectItem value="service">Serviço</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select
            value={form.categoryId ?? "none"}
            onValueChange={(v) => set("categoryId", v === "none" ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Nenhuma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 col-span-2">
          <Label>Descrição Curta</Label>
          <Input
            value={form.shortDescription ?? ""}
            onChange={(e) => set("shortDescription", e.target.value)}
          />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>Descrição Completa</Label>
          <Textarea
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            rows={4}
          />
        </div>
        <div className="space-y-2">
          <Label>Preço (R$)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.price ?? ""}
            onChange={(e) => set("price", parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label>Preço Promocional (R$)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.salePrice ?? ""}
            onChange={(e) =>
              set("salePrice", e.target.value ? parseFloat(e.target.value) : undefined)
            }
          />
        </div>
        {form.type === "package" && (
          <>
            <div className="space-y-2">
              <Label>Destino</Label>
              <Input
                value={form.destination ?? ""}
                onChange={(e) => set("destination", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Duração (dias)</Label>
              <Input
                type="number"
                min="1"
                value={form.duration ?? ""}
                onChange={(e) =>
                  set("duration", e.target.value ? parseInt(e.target.value) : undefined)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Saída</Label>
              <Input
                type="date"
                value={form.departureDate ?? ""}
                onChange={(e) => set("departureDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Retorno</Label>
              <Input
                type="date"
                value={form.returnDate ?? ""}
                onChange={(e) => set("returnDate", e.target.value)}
              />
            </div>
          </>
        )}
        <div className="space-y-2 col-span-2">
          <Label>Imagens (uma URL por linha)</Label>
          <Textarea
            value={(form.images ?? []).join("\n")}
            onChange={(e) => listEdit("images", e.target.value)}
            rows={2}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>O que está incluído (um por linha)</Label>
          <Textarea
            value={(form.includes ?? []).join("\n")}
            onChange={(e) => listEdit("includes", e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>O que não está incluído (um por linha)</Label>
          <Textarea
            value={(form.excludes ?? []).join("\n")}
            onChange={(e) => listEdit("excludes", e.target.value)}
            rows={2}
          />
        </div>
        <div className="col-span-2 flex gap-6">
          <div className="flex items-center gap-2">
            <Switch
              checked={form.isPublished ?? false}
              onCheckedChange={(v) => set("isPublished", v)}
            />
            <Label>Publicado</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.isFeatured ?? false}
              onCheckedChange={(v) => set("isFeatured", v)}
            />
            <Label>Destaque</Label>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

export default function LojaProdutos() {
  const { toast } = useToast();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingProduct, setEditingProduct] = useState<StoreProduct | undefined>();
  const [showDialog, setShowDialog] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        storeApi.getProducts(),
        storeApi.getCategories(),
      ]);
      setProducts(p);
      setCategories(c);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Store not found")) {
        toast({
          title: "Configure sua loja primeiro",
          description: "Acesse Minha Loja > Configurações para criar sua loja.",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await storeApi.deleteProduct(id);
      setProducts((p) => p.filter((x) => x.id !== id));
      toast({ title: "Produto excluído" });
    } catch (err: unknown) {
      toast({
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  }

  async function togglePublish(product: StoreProduct) {
    try {
      const updated = await storeApi.updateProduct(product.id, {
        isPublished: !product.isPublished,
      });
      setProducts((p) => p.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err: unknown) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.destination ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const getCategoryName = (id?: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos da Loja</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {products.length} produto(s) cadastrado(s)
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingProduct(undefined);
            setShowDialog(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Produto
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar produtos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum produto encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {product.images[0] ? (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="w-10 h-10 rounded object-cover border"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center">
                          <Package className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-sm">{product.name}</div>
                        {product.destination && (
                          <div className="text-xs text-muted-foreground">
                            {product.destination}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{getCategoryName(product.categoryId)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {product.type === "package"
                        ? "Pacote"
                        : product.type === "service"
                        ? "Serviço"
                        : "Produto"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {product.salePrice ? (
                      <div>
                        <span className="line-through text-muted-foreground mr-1">
                          R$ {parseFloat(product.price).toFixed(2)}
                        </span>
                        <span className="text-green-600 font-medium">
                          R$ {parseFloat(product.salePrice).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span>R$ {parseFloat(product.price).toFixed(2)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge variant={product.isPublished ? "default" : "secondary"}>
                        {product.isPublished ? "Publicado" : "Rascunho"}
                      </Badge>
                      {product.isFeatured && (
                        <Badge variant="outline" className="text-yellow-600">
                          <Star className="w-3 h-3 mr-1" />
                          Destaque
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => togglePublish(product)}
                        title={product.isPublished ? "Despublicar" : "Publicar"}
                      >
                        {product.isPublished ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingProduct(product);
                          setShowDialog(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={deleting === product.id}
                        onClick={() => handleDelete(product.id)}
                      >
                        {deleting === product.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Editar Produto" : "Novo Produto"}
            </DialogTitle>
          </DialogHeader>
          <ProductForm
            product={editingProduct}
            categories={categories}
            onSave={() => {
              setShowDialog(false);
              load();
            }}
            onClose={() => setShowDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
