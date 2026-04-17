import { useState, useEffect } from "react";
import { CoverImageUpload } from "@/components/cover-image-upload";
import { useToast } from "@/hooks/use-toast";
import { storeApi, StoreSettings, InitStoreInput } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Bell,
  FileText,
  Search,
  Link2,
  AlertTriangle,
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
    if (field === "name") {
      setForm((p) => ({ ...p, name: value as string, slug: !p.slug ? slugify(value as string) : p.slug }));
    } else {
      setForm((p) => ({ ...p, [field]: value }));
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
    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
      toast({ title: "E-mail inválido", variant: "destructive" });
      return;
    }
    setLoading(true);
    const payload: InitStoreInput = {
      name: form.name,
      slug: form.slug,
      contactEmail: form.contactEmail || undefined,
      contactWhatsapp: form.contactWhatsapp || undefined,
      paymentMethods: form.paymentMethods,
    };
    try {
      const store = await storeApi.initStore(payload);
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
    { id: "boleto", label: "Boleto Bancário" },
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
            <CardTitle>Passo 1 — Identidade da Loja</CardTitle>
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
                <span className="text-muted-foreground text-sm whitespace-nowrap">visitecrm.com/loja/</span>
                <Input
                  value={form.slug}
                  onChange={(e) => set("slug", slugify(e.target.value))}
                  placeholder="viagens-fantasticas"
                />
              </div>
              {form.slug && (
                <p className="text-xs text-muted-foreground">
                  Sua loja ficará em: <span className="font-mono text-primary">/loja/{form.slug}</span>
                </p>
              )}
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
            <CardTitle>Passo 2 — Contato</CardTitle>
            <CardDescription>Como os clientes podem entrar em contato com você.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail de Contato</Label>
              <Input
                type="email"
                value={form.contactEmail ?? ""}
                onChange={(e) => set("contactEmail", e.target.value)}
                placeholder="contato@agencia.com"
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input
                value={form.contactWhatsapp ?? ""}
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
            <CardTitle>Passo 3 — Formas de Pagamento</CardTitle>
            <CardDescription>Quais formas de pagamento você aceita?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {paymentOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => togglePayment(opt.id)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
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
  const [uploadingCount, setUploadingCount] = useState(0);
  const isUploading = uploadingCount > 0;
  const handleUploadingChange = (uploading: boolean) =>
    setUploadingCount((prev) => (uploading ? prev + 1 : Math.max(0, prev - 1)));
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
      toast({ title: "Configurações salvas com sucesso!" });
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
    { id: "boleto", label: "Boleto Bancário" },
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
  const paymentMethodsSelected = (form.paymentMethods as string[]) ?? [];

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
            {store.maintenanceMode && (
              <Badge variant="destructive">Em Manutenção</Badge>
            )}
          </div>
        </div>
        <Button onClick={save} disabled={saving || isUploading}>
          {(saving || isUploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isUploading ? "Aguardando upload..." : "Salvar Alterações"}
        </Button>
      </div>

      <Tabs defaultValue="geral">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="geral">
            <Store className="w-4 h-4 mr-1.5" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="aparencia">
            <Palette className="w-4 h-4 mr-1.5" />
            Aparência
          </TabsTrigger>
          <TabsTrigger value="contato">
            <Phone className="w-4 h-4 mr-1.5" />
            Contato
          </TabsTrigger>
          <TabsTrigger value="seo">
            <Search className="w-4 h-4 mr-1.5" />
            SEO
          </TabsTrigger>
          <TabsTrigger value="dominio">
            <Link2 className="w-4 h-4 mr-1.5" />
            Domínio
          </TabsTrigger>
          <TabsTrigger value="pagamento">
            <CreditCard className="w-4 h-4 mr-1.5" />
            Pagamentos
          </TabsTrigger>
          <TabsTrigger value="politicas">
            <FileText className="w-4 h-4 mr-1.5" />
            Políticas
          </TabsTrigger>
          <TabsTrigger value="notificacoes">
            <Bell className="w-4 h-4 mr-1.5" />
            Notificações
          </TabsTrigger>
        </TabsList>

        {/* ── GERAL ── */}
        <TabsContent value="geral" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações da Loja</CardTitle>
              <CardDescription>Nome, slug e descrição pública.</CardDescription>
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
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">/loja/</span>
                    <Input
                      value={form.slug ?? ""}
                      onChange={(e) => set("slug", slugify(e.target.value))}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tagline</Label>
                <Input
                  value={form.tagline ?? ""}
                  onChange={(e) => set("tagline", e.target.value)}
                  placeholder="Slogan ou frase de destaque"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                  placeholder="Descreva sua loja para os visitantes..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status da Loja</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Loja Ativa</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Permite que os clientes acessem e comprem.</p>
                </div>
                <Switch
                  checked={form.isActive ?? true}
                  onCheckedChange={(v) => set("isActive", v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Modo Manutenção</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Exibe uma mensagem de manutenção para visitantes.</p>
                </div>
                <Switch
                  checked={form.maintenanceMode ?? false}
                  onCheckedChange={(v) => set("maintenanceMode", v)}
                />
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
        </TabsContent>

        {/* ── APARÊNCIA ── */}
        <TabsContent value="aparencia" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cores da Marca</CardTitle>
              <CardDescription>Personalize as cores que aparecem na sua vitrine.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { field: "primaryColor", label: "Cor Principal", default: "#3B82F6" },
                  { field: "secondaryColor", label: "Cor Secundária", default: "#10B981" },
                  { field: "accentColor", label: "Cor de Destaque", default: "#F59E0B" },
                ].map(({ field, label, default: def }) => (
                  <div key={field} className="space-y-2">
                    <Label>{label}</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={(form as Record<string, string>)[field] ?? def}
                        onChange={(e) => set(field, e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border"
                      />
                      <Input
                        value={(form as Record<string, string>)[field] ?? def}
                        onChange={(e) => set(field, e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Imagens</CardTitle>
              <CardDescription>Envie o logo e o banner da sua loja (PNG, JPG, WEBP).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="space-y-2">
                <Label>Logo da Loja</Label>
                <p className="text-xs text-muted-foreground">Recomendado: fundo transparente (PNG) · máx. 2 MB</p>
                <CoverImageUpload
                  endpoint="storeLogo"
                  value={form.logo ?? ""}
                  onChange={(url) => set("logo", url)}
                  onUploadingChange={handleUploadingChange}
                  disabled={saving}
                  previewClassName="h-24"
                  objectFit="contain"
                  emptyLabel="Clique ou arraste o logo aqui"
                />
              </div>
              <div className="space-y-2">
                <Label>Banner Principal</Label>
                <p className="text-xs text-muted-foreground">Exibido na página inicial da sua vitrine · máx. 4 MB</p>
                <CoverImageUpload
                  endpoint="storeBanner"
                  value={form.bannerHome ?? ""}
                  onChange={(url) => set("bannerHome", url)}
                  onUploadingChange={handleUploadingChange}
                  disabled={saving}
                  previewClassName="h-48"
                  objectFit="cover"
                  emptyLabel="Clique ou arraste o banner aqui"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CONTATO ── */}
        <TabsContent value="contato" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações de Contato</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail de Contato</Label>
                <Input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="contato@agencia.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={form.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="(11) 3333-4444"
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input
                  value={form.whatsapp ?? ""}
                  onChange={(e) => set("whatsapp", e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input
                  value={form.address ?? ""}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="Rua, número, cidade - Estado"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Redes Sociais</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input
                  value={form.instagramUrl ?? ""}
                  onChange={(e) => set("instagramUrl", e.target.value)}
                  placeholder="https://instagram.com/minhaagencia"
                />
              </div>
              <div className="space-y-2">
                <Label>Facebook</Label>
                <Input
                  value={form.facebookUrl ?? ""}
                  onChange={(e) => set("facebookUrl", e.target.value)}
                  placeholder="https://facebook.com/minhaagencia"
                />
              </div>
              <div className="space-y-2">
                <Label>YouTube</Label>
                <Input
                  value={form.youtubeUrl ?? ""}
                  onChange={(e) => set("youtubeUrl", e.target.value)}
                  placeholder="https://youtube.com/c/minhaagencia"
                />
              </div>
              <div className="space-y-2">
                <Label>TikTok</Label>
                <Input
                  value={form.tiktokUrl ?? ""}
                  onChange={(e) => set("tiktokUrl", e.target.value)}
                  placeholder="https://tiktok.com/@minhaagencia"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SEO ── */}
        <TabsContent value="seo" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>SEO e Metatags</CardTitle>
              <CardDescription>Dados exibidos no Google e compartilhamentos em redes sociais.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label>Título SEO (meta title)</Label>
                <Input
                  value={form.metaTitle ?? ""}
                  onChange={(e) => set("metaTitle", e.target.value)}
                  placeholder={`${form.name ?? "Minha Loja"} — Pacotes e Viagens`}
                />
                <p className="text-xs text-muted-foreground">Ideal entre 50–60 caracteres. ({(form.metaTitle ?? "").length}/60)</p>
              </div>
              <div className="space-y-2">
                <Label>Meta Descrição</Label>
                <Textarea
                  value={form.metaDescription ?? ""}
                  onChange={(e) => set("metaDescription", e.target.value)}
                  rows={3}
                  placeholder="Descrição que aparece nos resultados de busca..."
                />
                <p className="text-xs text-muted-foreground">Ideal entre 120–160 caracteres. ({(form.metaDescription ?? "").length}/160)</p>
              </div>
              <div className="space-y-2">
                <Label>Palavras-chave</Label>
                <Input
                  value={form.metaKeywords ?? ""}
                  onChange={(e) => set("metaKeywords", e.target.value)}
                  placeholder="viagens, pacotes, turismo, férias"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DOMÍNIO ── */}
        <TabsContent value="dominio" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Domínio Personalizado</CardTitle>
              <CardDescription>Aponte seu domínio próprio para esta loja.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Domínio Personalizado</Label>
                <Input
                  value={form.customDomain ?? ""}
                  onChange={(e) => set("customDomain", e.target.value)}
                  placeholder="www.minhaagencia.com.br"
                />
              </div>
              {form.customDomain && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 space-y-1">
                    <p className="font-medium">Configuração de DNS necessária</p>
                    <p>Aponte o registro <span className="font-mono">CNAME</span> do domínio <strong>{form.customDomain}</strong> para:</p>
                    <p className="font-mono bg-amber-100 px-2 py-1 rounded">cname.visitecrm.com.br</p>
                    <p className="text-xs text-amber-600">A propagação pode levar até 48 horas.</p>
                  </div>
                </div>
              )}
              {store.domainVerified && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  Domínio verificado e ativo
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  URL padrão: <span className="font-mono text-primary">/loja/{form.slug}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PAGAMENTOS ── */}
        <TabsContent value="pagamento" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Métodos Aceitos</CardTitle>
              <CardDescription>Selecione as formas de pagamento disponíveis na sua loja.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {paymentOptions.map((opt) => {
                  const selected = paymentMethodsSelected.includes(opt.id);
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

          {/* Stripe */}
          {paymentMethodsSelected.includes("credit_card") && (
            <Card>
              <CardHeader>
                <CardTitle>Stripe</CardTitle>
                <CardDescription>Credenciais para processar cartão de crédito via Stripe.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Ativar Stripe</Label>
                  <Switch
                    checked={form.stripeEnabled ?? false}
                    onCheckedChange={(v) => set("stripeEnabled", v)}
                  />
                </div>
                {form.stripeEnabled && (
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label>Chave Pública (Publishable Key)</Label>
                      <Input
                        value={form.stripePublicKey ?? ""}
                        onChange={(e) => set("stripePublicKey", e.target.value)}
                        placeholder="pk_live_..."
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Chave Secreta (Secret Key)</Label>
                      <Input
                        type="password"
                        value={form.stripeSecretKey ?? ""}
                        onChange={(e) => set("stripeSecretKey", e.target.value)}
                        placeholder="sk_live_..."
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* MercadoPago */}
          <Card>
            <CardHeader>
              <CardTitle>Mercado Pago</CardTitle>
              <CardDescription>Aceite PIX, boleto e cartões via Mercado Pago.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Ativar Mercado Pago</Label>
                <Switch
                  checked={form.mpEnabled ?? false}
                  onCheckedChange={(v) => set("mpEnabled", v)}
                />
              </div>
              {form.mpEnabled && (
                <div className="grid gap-3">
                  <div className="space-y-2">
                    <Label>Public Key</Label>
                    <Input
                      value={form.mpPublicKey ?? ""}
                      onChange={(e) => set("mpPublicKey", e.target.value)}
                      placeholder="APP_USR-..."
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Access Token</Label>
                    <Input
                      type="password"
                      value={form.mpAccessToken ?? ""}
                      onChange={(e) => set("mpAccessToken", e.target.value)}
                      placeholder="APP_USR-..."
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PIX Manual */}
          {paymentMethodsSelected.includes("pix") && (
            <Card>
              <CardHeader>
                <CardTitle>PIX Manual</CardTitle>
                <CardDescription>Para receber PIX manualmente sem gateway.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Ativar PIX Manual</Label>
                  <Switch
                    checked={form.pixEnabled ?? false}
                    onCheckedChange={(v) => set("pixEnabled", v)}
                  />
                </div>
                {form.pixEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Chave PIX</Label>
                      <Input
                        value={form.pixKey ?? ""}
                        onChange={(e) => set("pixKey", e.target.value)}
                        placeholder="CPF, CNPJ, e-mail ou chave aleatória"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo da Chave</Label>
                      <select
                        value={form.pixKeyType ?? "email"}
                        onChange={(e) => set("pixKeyType", e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      >
                        <option value="cpf">CPF</option>
                        <option value="cnpj">CNPJ</option>
                        <option value="email">E-mail</option>
                        <option value="phone">Telefone</option>
                        <option value="random">Chave Aleatória</option>
                      </select>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Boleto */}
          {paymentMethodsSelected.includes("boleto") && (
            <Card>
              <CardHeader>
                <CardTitle>Boleto Bancário</CardTitle>
                <CardDescription>Configure instruções para pagamento via boleto.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Ativar Boleto</Label>
                  <Switch
                    checked={form.boletoEnabled ?? false}
                    onCheckedChange={(v) => set("boletoEnabled", v)}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── POLÍTICAS ── */}
        <TabsContent value="politicas" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Políticas da Loja</CardTitle>
              <CardDescription>Textos exibidos na vitrine sobre regras e condições.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Política de Cancelamento</Label>
                <Textarea
                  value={form.cancellationPolicy ?? ""}
                  onChange={(e) => set("cancellationPolicy", e.target.value)}
                  rows={4}
                  placeholder="Descreva as regras de cancelamento..."
                />
              </div>
              <div className="space-y-2">
                <Label>Política de Reembolso</Label>
                <Textarea
                  value={form.refundPolicy ?? ""}
                  onChange={(e) => set("refundPolicy", e.target.value)}
                  rows={4}
                  placeholder="Como são feitos os reembolsos..."
                />
              </div>
              <div className="space-y-2">
                <Label>Política de Privacidade</Label>
                <Textarea
                  value={form.privacyPolicy ?? ""}
                  onChange={(e) => set("privacyPolicy", e.target.value)}
                  rows={4}
                  placeholder="Como coletamos e usamos os dados dos clientes..."
                />
              </div>
              <div className="space-y-2">
                <Label>Termos de Serviço</Label>
                <Textarea
                  value={form.termsOfService ?? ""}
                  onChange={(e) => set("termsOfService", e.target.value)}
                  rows={4}
                  placeholder="Termos e condições de uso da loja..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── NOTIFICAÇÕES ── */}
        <TabsContent value="notificacoes" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Notificações de Pedidos</CardTitle>
              <CardDescription>Configure quando e como receber alertas de novos pedidos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Notificações de Novos Pedidos</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Receba um e-mail sempre que um novo pedido for feito.
                  </p>
                </div>
                <Switch
                  checked={form.orderNotificationEnabled ?? true}
                  onCheckedChange={(v) => set("orderNotificationEnabled", v)}
                />
              </div>
              {form.orderNotificationEnabled && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>E-mail para Notificações</Label>
                    <Input
                      type="email"
                      value={form.notificationEmail ?? ""}
                      onChange={(e) => set("notificationEmail", e.target.value)}
                      placeholder="vendas@agencia.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco para usar o e-mail de contato da loja.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
