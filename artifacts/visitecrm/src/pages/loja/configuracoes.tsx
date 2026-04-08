import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { storeApi, StoreSettings, InitStoreInput } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Store,
  Globe,
  Palette,
  Phone,
  CreditCard,
  ExternalLink,
  Loader2,
  CheckCircle,
} from "lucide-react";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function StoreWizard({ onCreated }: { onCreated: (s: StoreSettings) => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<InitStoreInput & { paymentMethods: string[] }>({
    name: "",
    slug: "",
    contactEmail: "",
    contactWhatsapp: "",
    paymentMethods: [],
  });

  function set(field: string, value: unknown) {
    setForm((p) => ({ ...p, [field]: value }));
    if (field === "name" && !form.slug) {
      setForm((p) => ({ ...p, slug: slugify(value as string) }));
    }
  }

  function togglePayment(method: string) {
    setForm((p) => ({
      ...p,
      paymentMethods: p.paymentMethods.includes(method)
        ? p.paymentMethods.filter((m) => m !== method)
        : [...p.paymentMethods, method],
    }));
  }

  async function submit() {
    if (!form.name || !form.slug) {
      toast({ title: "Preencha nome e slug", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const store = await storeApi.initStore(form);
      toast({ title: "Loja criada com sucesso!" });
      onCreated(store);
    } catch (err: unknown) {
      toast({
        title: "Erro ao criar loja",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const paymentOptions = [
    { id: "pix", label: "PIX" },
    { id: "boleto", label: "Boleto" },
    { id: "credit_card", label: "Cartão de Crédito" },
    { id: "debit_card", label: "Cartão de Débito" },
    { id: "transfer", label: "Transferência Bancária" },
  ];

  return (
    <div className="max-w-xl mx-auto py-12">
      <div className="mb-8 text-center">
        <Store className="w-16 h-16 mx-auto mb-4 text-primary" />
        <h1 className="text-3xl font-bold">Crie sua Loja Online</h1>
        <p className="text-muted-foreground mt-2">
          Configure sua vitrine e comece a vender em minutos.
        </p>
      </div>

      <div className="flex gap-2 justify-center mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 w-16 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
            <CardDescription>Como sua loja vai aparecer para os clientes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Loja *</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Ex: Viagens Fantásticas"
              />
            </div>
            <div className="space-y-2">
              <Label>URL da Loja (slug) *</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">vistecrm.com/loja/</span>
                <Input
                  value={form.slug}
                  onChange={(e) => set("slug", slugify(e.target.value))}
                  placeholder="viagens-fantasticas"
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => setStep(2)}
              disabled={!form.name || !form.slug}
            >
              Próximo
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Contato</CardTitle>
            <CardDescription>Como os clientes podem entrar em contato.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail de Contato</Label>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                placeholder="contato@agencia.com"
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input
                value={form.contactWhatsapp}
                onChange={(e) => set("contactWhatsapp", e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Próximo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Formas de Pagamento</CardTitle>
            <CardDescription>Quais formas de pagamento você aceita?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {paymentOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => togglePayment(opt.id)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                    form.paymentMethods.includes(opt.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {form.paymentMethods.includes(opt.id) && (
                    <CheckCircle className="w-4 h-4 inline mr-1" />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button className="flex-1" onClick={submit} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Loja
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function LojaConfiguracoes() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [form, setForm] = useState<Partial<StoreSettings>>({});

  useEffect(() => {
    storeApi
      .getSettings()
      .then((s) => {
        setStore(s);
        setForm(s);
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, []);

  function set(field: string, value: unknown) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await storeApi.updateSettings(form);
      setStore(updated);
      setForm(updated);
      toast({ title: "Configurações salvas!" });
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!store) {
    return <StoreWizard onCreated={(s) => { setStore(s); setForm(s); }} />;
  }

  const paymentOptions = [
    { id: "pix", label: "PIX" },
    { id: "boleto", label: "Boleto" },
    { id: "credit_card", label: "Cartão de Crédito" },
    { id: "debit_card", label: "Cartão de Débito" },
    { id: "transfer", label: "Transferência Bancária" },
  ];

  function togglePayment(method: string) {
    const current = (form.paymentMethods as string[]) ?? [];
    set(
      "paymentMethods",
      current.includes(method)
        ? current.filter((m) => m !== method)
        : [...current, method]
    );
  }

  const storeUrl = `/loja/${store.slug}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações da Loja</h1>
          <div className="flex items-center gap-2 mt-1">
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <Globe className="w-3 h-3" />
              {store.slug}
              <ExternalLink className="w-3 h-3" />
            </a>
            <Badge variant={store.isActive ? "default" : "secondary"}>
              {store.isActive ? "Ativa" : "Inativa"}
            </Badge>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar Alterações
        </Button>
      </div>

      <Tabs defaultValue="geral">
        <TabsList>
          <TabsTrigger value="geral">
            <Store className="w-4 h-4 mr-2" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="aparencia">
            <Palette className="w-4 h-4 mr-2" />
            Aparência
          </TabsTrigger>
          <TabsTrigger value="contato">
            <Phone className="w-4 h-4 mr-2" />
            Contato
          </TabsTrigger>
          <TabsTrigger value="pagamento">
            <CreditCard className="w-4 h-4 mr-2" />
            Pagamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações da Loja</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Loja</Label>
                  <Input
                    value={form.name ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL)</Label>
                  <Input
                    value={form.slug ?? ""}
                    onChange={(e) => set("slug", slugify(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SEO — Título</Label>
                  <Input
                    value={form.seoTitle ?? ""}
                    onChange={(e) => set("seoTitle", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SEO — Descrição</Label>
                  <Input
                    value={form.seoDescription ?? ""}
                    onChange={(e) => set("seoDescription", e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.isActive ?? true}
                    onCheckedChange={(v) => set("isActive", v)}
                  />
                  <Label>Loja Ativa</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.maintenanceMode ?? false}
                    onCheckedChange={(v) => set("maintenanceMode", v)}
                  />
                  <Label>Modo Manutenção</Label>
                </div>
              </div>
              {form.maintenanceMode && (
                <div className="space-y-2">
                  <Label>Mensagem de Manutenção</Label>
                  <Input
                    value={form.maintenanceMessage ?? ""}
                    onChange={(e) => set("maintenanceMessage", e.target.value)}
                    placeholder="Estamos em manutenção, voltamos em breve!"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Políticas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label>Política de Envio</Label>
                <Textarea
                  value={form.shippingPolicy ?? ""}
                  onChange={(e) => set("shippingPolicy", e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Política de Cancelamento</Label>
                <Textarea
                  value={form.returnPolicy ?? ""}
                  onChange={(e) => set("returnPolicy", e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aparencia" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cores e Identidade</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Cor Principal</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={form.primaryColor ?? "#3B82F6"}
                      onChange={(e) => set("primaryColor", e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border"
                    />
                    <Input
                      value={form.primaryColor ?? "#3B82F6"}
                      onChange={(e) => set("primaryColor", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor Secundária</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={form.secondaryColor ?? "#10B981"}
                      onChange={(e) => set("secondaryColor", e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border"
                    />
                    <Input
                      value={form.secondaryColor ?? "#10B981"}
                      onChange={(e) => set("secondaryColor", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor de Destaque</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={form.accentColor ?? "#F59E0B"}
                      onChange={(e) => set("accentColor", e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border"
                    />
                    <Input
                      value={form.accentColor ?? "#F59E0B"}
                      onChange={(e) => set("accentColor", e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>URL do Logo</Label>
                  <Input
                    value={form.logoUrl ?? ""}
                    onChange={(e) => set("logoUrl", e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL do Banner</Label>
                  <Input
                    value={form.bannerUrl ?? ""}
                    onChange={(e) => set("bannerUrl", e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contato" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações de Contato</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  value={form.contactEmail ?? ""}
                  onChange={(e) => set("contactEmail", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={form.contactPhone ?? ""}
                  onChange={(e) => set("contactPhone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input
                  value={form.contactWhatsapp ?? ""}
                  onChange={(e) => set("contactWhatsapp", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input
                  value={form.contactAddress ?? ""}
                  onChange={(e) => set("contactAddress", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input
                  value={form.socialInstagram ?? ""}
                  onChange={(e) => set("socialInstagram", e.target.value)}
                  placeholder="@minhaagencia"
                />
              </div>
              <div className="space-y-2">
                <Label>Facebook</Label>
                <Input
                  value={form.socialFacebook ?? ""}
                  onChange={(e) => set("socialFacebook", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>YouTube</Label>
                <Input
                  value={form.socialYoutube ?? ""}
                  onChange={(e) => set("socialYoutube", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail notificações de pedidos</Label>
                <Input
                  value={form.notifyEmail ?? ""}
                  onChange={(e) => set("notifyEmail", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagamento" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Formas de Pagamento</CardTitle>
              <CardDescription>Selecione as opções disponíveis para seus clientes.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {paymentOptions.map((opt) => {
                  const selected = ((form.paymentMethods as string[]) ?? []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => togglePayment(opt.id)}
                      className={`p-4 rounded-lg border text-sm font-medium transition-colors text-left ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {selected && <CheckCircle className="w-4 h-4 inline mr-2" />}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
