import { useState, useRef, useEffect } from "react";
import { useGetInsightsSummary } from "@workspace/api-client-react";
import type { GetInsightsSummaryPeriod } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  TrendingUp, TrendingDown, Minus,
  DollarSign, Users, Target, BarChart2, Map, Star, BrainCircuit,
  ShoppingCart, Zap, Package, Heart, Globe,
  ArrowUpRight, ArrowDownRight, Mail, Send, MousePointerClick, CheckCircle2,
  Repeat2, UserCheck, Award, Navigation, Bot, MessageCircle, X, ChevronUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@clerk/react";

const fmt = (v: number) => formatCurrency(v);
const fmtCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return fmt(v);
};
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtNum = (v: number) => String(Math.round(v));

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function GrowthBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <Badge variant="secondary" className={isPositive ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"}>
      {isPositive ? "+" : ""}{value.toFixed(1)}%
    </Badge>
  );
}

function VariationBadge({ curr, prev, invert = false }: { curr: number; prev: number | null; invert?: boolean }) {
  if (prev === null || prev === 0) return null;
  const delta = ((curr - (prev ?? 0)) / Math.abs(prev)) * 100;
  const isPositive = invert ? delta < 0 : delta >= 0;
  const color = isPositive ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50";
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  if (Math.abs(delta) < 0.05) return <span className="text-xs text-muted-foreground ml-1">—</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ml-1.5 ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  prev,
  prevValue,
  sub,
  color,
  loading,
  invert,
  format = "compact",
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  prev?: number | null;
  prevValue?: string;
  sub?: string;
  color: string;
  loading?: boolean;
  invert?: boolean;
  format?: "compact" | "currency" | "pct" | "num";
}) {
  const display =
    format === "pct" ? fmtPct(value) :
    format === "num" ? fmtNum(value) :
    format === "currency" ? fmt(value) :
    fmtCompact(value);

  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`mt-1 p-2 rounded-md bg-muted ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-28 mt-1" />
          ) : (
            <div className="flex items-center flex-wrap mt-0.5">
              <p className="text-xl font-bold">{display}</p>
              {prev != null && <VariationBadge curr={value} prev={prev} invert={invert} />}
            </div>
          )}
          {sub && !loading && (
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          )}
          {prevValue && !loading && (
            <p className="text-xs text-muted-foreground mt-0.5">Período anterior: {prevValue}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function NpsCard({ averageNps, averageNpsPrev }: { averageNps: number | null | undefined; averageNpsPrev: number | null | undefined }) {
  if (averageNps == null) return null;
  const nps = Number(averageNps);
  const npsPrev = averageNpsPrev != null ? Number(averageNpsPrev) : null;
  const color = nps >= 70 ? "bg-green-500" : nps >= 50 ? "bg-yellow-500" : "bg-red-500";
  const label = nps >= 70 ? "Excelente" : nps >= 50 ? "Bom" : "A melhorar";
  const textColor = nps >= 70 ? "text-green-600" : nps >= 50 ? "text-yellow-600" : "text-red-600";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="w-4 h-4" /> NPS — Net Promoter Score
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-6">
        <div>
          <p className="text-5xl font-bold">{nps.toFixed(0)}</p>
          <p className={`text-sm font-medium mt-1 ${textColor}`}>{label}</p>
          {npsPrev != null && (
            <p className="text-xs text-muted-foreground mt-1">Anterior: {npsPrev.toFixed(0)} pontos</p>
          )}
        </div>
        <div className="flex-1">
          <div className="w-full bg-muted rounded-full h-3">
            <div className={`h-3 rounded-full ${color}`} style={{ width: `${Math.min(nps, 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Escala de 0 a 100 pontos</p>
        </div>
      </CardContent>
    </Card>
  );
}

const PERIOD_LABELS: Record<string, string> = {
  month: "mês anterior",
  quarter: "trimestre anterior",
  year: "ano anterior",
};

const SUGGESTED_QUESTIONS = [
  "Qual a saúde financeira da agência neste período?",
  "Qual campanha teve melhor desempenho?",
  "Qual viagem tem risco de baixa ocupação?",
  "Como está a taxa de retenção de clientes?",
  "Quais clientes têm maior potencial de recompra?",
  "Qual é a previsão de faturamento para os próximos 90 dias?",
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function InsightsChat({ period }: { period: string }) {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: content.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsStreaming(true);

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const token = await getToken();
      const response = await fetch("/api/insights/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: nextMessages, period }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw) as { content?: string; done?: boolean; error?: string };
            if (parsed.error) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: `⚠️ ${parsed.error}` };
                return updated;
              });
            } else if (parsed.content) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.content };
                }
                return updated;
              });
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "⚠️ Não foi possível conectar ao assistente. Tente novamente." };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[540px]">
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4">
          <div className="p-4 rounded-full bg-primary/10">
            <Bot className="w-10 h-10 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold">Assistente de Inteligência Turística</p>
            <p className="text-sm text-muted-foreground mt-1">Faça perguntas sobre os dados da agência no período selecionado</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center max-w-xl">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => void sendMessage(q)}
                className="text-xs border rounded-full px-3 py-1.5 hover:bg-primary/5 hover:border-primary/40 transition-colors text-muted-foreground hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-muted text-foreground rounded-tl-sm"
              }`}>
                {msg.content || (isStreaming && i === messages.length - 1 ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                ) : "")}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                  <Users className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {!isEmpty && messages.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1">
            {SUGGESTED_QUESTIONS.slice(0, 3).map((q) => (
              <button
                key={q}
                onClick={() => void sendMessage(q)}
                disabled={isStreaming}
                className="text-xs border rounded-full px-2.5 py-1 hover:bg-primary/5 hover:border-primary/40 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t px-4 py-3 flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte algo sobre os dados da agência..."
          className="min-h-[40px] max-h-[120px] resize-none text-sm"
          rows={1}
          disabled={isStreaming}
        />
        <Button
          size="icon"
          onClick={() => void sendMessage(input)}
          disabled={!input.trim() || isStreaming}
          className="shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Insights() {
  const [period, setPeriod] = useState<GetInsightsSummaryPeriod>("month");
  const [chatOpen, setChatOpen] = useState(false);
  const { data, isLoading } = useGetInsightsSummary({ period });
  const prevLabel = PERIOD_LABELS[period] ?? "período anterior";

  const ex = data?.executive;
  const co = data?.commercial;
  const mk = data?.marketing;
  const fi = data?.financial;
  const op = data?.operational;
  const re = data?.retention;
  const ex2 = data?.expansion;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-primary" />
            Insights Estratégicos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Inteligência de negócio em 7 pilares — variações vs. {prevLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as GetInsightsSummaryPeriod)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="quarter">Último trimestre</SelectItem>
              <SelectItem value="year">Este ano</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={chatOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setChatOpen((v) => !v)}
            className="gap-1.5"
          >
            {chatOpen ? <X className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
            {chatOpen ? "Fechar IA" : "Perguntar à IA"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="executiva">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="executiva">Executiva</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="financeira">Financeira</TabsTrigger>
          <TabsTrigger value="operacional">Operacional</TabsTrigger>
          <TabsTrigger value="retencao">Retenção</TabsTrigger>
          <TabsTrigger value="expansao">Expansão</TabsTrigger>
        </TabsList>

        {/* ─── EXECUTIVA ─────────────────────────────────────────────── */}
        <TabsContent value="executiva" className="mt-5 space-y-4">
          <SectionHeader
            icon={BarChart2}
            title="Visão Executiva"
            description="Panorama completo da saúde do negócio no período"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={DollarSign} label="Receita Total" value={ex?.totalRevenue ?? 0} prev={ex?.totalRevenuePrev ?? null} format="compact" color="text-green-600" loading={isLoading} prevValue={fmtCompact(ex?.totalRevenuePrev ?? 0)} />
            <KpiCard icon={TrendingUp} label="Lucro Líquido" value={ex?.netProfit ?? 0} prev={ex?.netProfitPrev ?? null} format="compact" color={(ex?.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"} loading={isLoading} prevValue={fmtCompact(ex?.netProfitPrev ?? 0)} />
            <KpiCard icon={Target} label="Margem de Lucro" value={ex?.profitMargin ?? 0} prev={ex?.profitMarginPrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(ex?.profitMarginPrev ?? 0)} />
            <KpiCard icon={Users} label="Novos Clientes" value={ex?.newClients ?? 0} prev={ex?.newClientsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(ex?.newClientsPrev ?? 0)} />
            <KpiCard icon={ShoppingCart} label="Reservas Confirmadas" value={ex?.confirmedReservations ?? 0} prev={ex?.confirmedReservationsPrev ?? null} format="num" color="text-blue-600" loading={isLoading} prevValue={fmtNum(ex?.confirmedReservationsPrev ?? 0)} />
            <KpiCard icon={Map} label="Viagens Ativas" value={ex?.activeTrips ?? 0} format="num" color="text-orange-600" loading={isLoading} />
            <KpiCard icon={Zap} label="Taxa de Conversão" value={ex?.conversionRate ?? 0} prev={ex?.conversionRatePrev ?? null} format="pct" color="text-purple-600" loading={isLoading} prevValue={fmtPct(ex?.conversionRatePrev ?? 0)} />
            <KpiCard icon={BarChart2} label="Ocupação Média" value={ex?.occupancyRate ?? 0} format="pct" color="text-cyan-600" loading={isLoading} />
          </div>

          {!isLoading && ex && (ex.momGrowth != null || ex.yoyGrowth != null) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Crescimento de Receita</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-8">
                {ex.momGrowth != null && (
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">MoM (mês vs. anterior)</span>
                    <div className="flex items-center gap-2">
                      <GrowthBadge value={ex.momGrowth} />
                    </div>
                  </div>
                )}
                {ex.yoyGrowth != null && (
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">YoY (ano vs. anterior)</span>
                    <div className="flex items-center gap-2">
                      <GrowthBadge value={ex.yoyGrowth} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <NpsCard averageNps={ex?.averageNps} averageNpsPrev={ex?.averageNpsPrev} />
        </TabsContent>

        {/* ─── COMERCIAL ─────────────────────────────────────────────── */}
        <TabsContent value="comercial" className="mt-5 space-y-4">
          <SectionHeader
            icon={Target}
            title="Visão Comercial"
            description="Pipeline, conversão e desempenho de vendas"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Target} label="Negócios Abertos" value={co?.openDeals ?? 0} prev={co?.openDealsPrev ?? null} format="num" color="text-orange-600" loading={isLoading} prevValue={fmtNum(co?.openDealsPrev ?? 0)} />
            <KpiCard icon={TrendingUp} label="Negócios Ganhos" value={co?.wonDeals ?? 0} prev={co?.wonDealsPrev ?? null} format="num" color="text-green-600" loading={isLoading} prevValue={fmtNum(co?.wonDealsPrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Valor do Pipeline" value={co?.pipelineValue ?? 0} prev={co?.pipelineValuePrev ?? null} format="compact" color="text-blue-600" loading={isLoading} prevValue={fmtCompact(co?.pipelineValuePrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Ticket Médio" value={co?.avgTicket ?? 0} prev={co?.avgTicketPrev ?? null} format="compact" color="text-purple-600" loading={isLoading} prevValue={fmtCompact(co?.avgTicketPrev ?? 0)} />
            <KpiCard icon={ShoppingCart} label="Novas Reservas" value={co?.newReservations ?? 0} prev={co?.newReservationsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(co?.newReservationsPrev ?? 0)} />
            <KpiCard icon={Zap} label="Taxa de Conversão" value={co?.conversionRate ?? 0} prev={co?.conversionRatePrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(co?.conversionRatePrev ?? 0)} />
            <KpiCard icon={Repeat2} label="Clientes Recorrentes" value={co?.repeatClients ?? 0} prev={co?.repeatClientsPrev ?? null} format="num" color="text-cyan-600" loading={isLoading} prevValue={fmtNum(co?.repeatClientsPrev ?? 0)} sub="compraram ≥2x" />
            <KpiCard icon={TrendingDown} label="Cancelamentos" value={co?.cancellations ?? 0} prev={co?.cancellationsPrev ?? null} format="num" color="text-red-600" loading={isLoading} invert prevValue={fmtNum(co?.cancellationsPrev ?? 0)} />
            <KpiCard icon={UserCheck} label="Clientes Ativos" value={co?.activeClients ?? 0} prev={co?.activeClientsPrev ?? null} format="num" color="text-emerald-600" loading={isLoading} prevValue={fmtNum(co?.activeClientsPrev ?? 0)} sub="com ≥1 reserva confirmada" />
            <KpiCard icon={TrendingUp} label="LTV Estimado" value={co?.ltv ?? 0} prev={co?.ltvPrev ?? null} format="compact" color="text-purple-600" loading={isLoading} prevValue={fmtCompact(co?.ltvPrev ?? 0)} sub="ticket × freq. de compras" />
            <KpiCard icon={DollarSign} label="CAC Estimado" value={co?.cac ?? 0} prev={co?.cacPrev ?? null} format="compact" color="text-orange-500" loading={isLoading} invert prevValue={fmtCompact(co?.cacPrev ?? 0)} sub="comissões / novos clientes" />
          </div>

          {!isLoading && co && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Funil de Conversão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Leads Totais", value: co.totalLeads, color: "#3B82F6" },
                  { label: "Negócios Abertos", value: co.openDeals, color: "#8B5CF6" },
                  { label: "Novas Reservas", value: co.newReservations, color: "#F59E0B" },
                  { label: "Confirmadas", value: co.wonDeals, color: "#10B981" },
                ].map((item) => {
                  const max = co.totalLeads || 1;
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-32 shrink-0">{item.label}</span>
                      <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                        <div className="h-5 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, backgroundColor: item.color }}>
                          <span className="text-xs font-medium text-white">{item.value}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── MARKETING ─────────────────────────────────────────────── */}
        <TabsContent value="marketing" className="mt-5 space-y-4">
          <SectionHeader
            icon={Zap}
            title="Visão de Marketing"
            description="Campanhas, captação de clientes e conversão"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Users} label="Novos Clientes" value={mk?.newClients ?? 0} prev={mk?.newClientsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(mk?.newClientsPrev ?? 0)} />
            <KpiCard icon={Target} label="Total de Leads" value={mk?.totalLeads ?? 0} prev={mk?.totalLeadsPrev ?? null} format="num" color="text-blue-600" loading={isLoading} prevValue={fmtNum(mk?.totalLeadsPrev ?? 0)} />
            <KpiCard icon={Zap} label="Taxa de Conversão" value={mk?.conversionRate ?? 0} prev={mk?.conversionRatePrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(mk?.conversionRatePrev ?? 0)} />
            <KpiCard icon={ArrowUpRight} label="Indicações Geradas" value={mk?.referrals ?? 0} prev={mk?.referralsPrev ?? null} format="num" color="text-orange-600" loading={isLoading} prevValue={fmtNum(mk?.referralsPrev ?? 0)} />
            <KpiCard icon={CheckCircle2} label="Indicações Convertidas" value={mk?.convertedReferrals ?? 0} prev={mk?.convertedReferralsPrev ?? null} format="num" color="text-green-600" loading={isLoading} prevValue={fmtNum(mk?.convertedReferralsPrev ?? 0)} />
            <KpiCard icon={Send} label="Campanhas Ativas" value={mk?.activeCampaigns ?? 0} format="num" color="text-purple-600" loading={isLoading} sub={`${mk?.newCampaigns ?? 0} criadas no período`} />
            <KpiCard icon={Mail} label="E-mails Enviados" value={mk?.totalSentMessages ?? 0} format="num" color="text-cyan-600" loading={isLoading} sub={`${mk?.sentCampaigns ?? 0} campanhas disparadas`} />
            <KpiCard icon={MousePointerClick} label="Taxa de Abertura" value={mk?.openRate ?? 0} format="pct" color="text-yellow-600" loading={isLoading} sub={`Click rate: ${fmtPct(mk?.clickRate ?? 0)}`} />
            <KpiCard icon={TrendingUp} label="ROI por Campanha" value={mk?.campaignRoi ?? 0} format="compact" color="text-green-600" loading={isLoading} sub="receita / campanhas enviadas" />
          </div>

          {!isLoading && mk && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Performance de Campanhas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Campanhas ativas</span>
                    <span className="font-semibold">{mk.activeCampaigns}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Disparadas no período</span>
                    <span className="font-semibold">{mk.sentCampaigns}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Total de destinatários</span>
                    <span className="font-semibold">{mk.totalRecipients.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Abertos</span>
                    <span className="font-semibold text-primary">{mk.totalOpenedMessages.toLocaleString("pt-BR")} ({fmtPct(mk.openRate)})</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Clicados</span>
                    <span className="font-semibold text-indigo-600">{mk.totalClickedMessages.toLocaleString("pt-BR")} ({fmtPct(mk.clickRate)})</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Captação & Indicações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Novos clientes</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{mk.newClients}</span>
                      <GrowthBadge value={pctChange(mk.newClients, mk.newClientsPrev)} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Indicações geradas</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{mk.referrals}</span>
                      <GrowthBadge value={pctChange(mk.referrals, mk.referralsPrev)} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Indicações convertidas</span>
                    <span className="font-semibold text-green-600">{mk.convertedReferrals}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Conversão leads → venda</span>
                    <span className="font-semibold text-primary">{fmtPct(mk.conversionRate)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── FINANCEIRA ────────────────────────────────────────────── */}
        <TabsContent value="financeira" className="mt-5 space-y-4">
          <SectionHeader
            icon={DollarSign}
            title="Visão Financeira"
            description="Receita, despesas, margem, comissões e fluxo de caixa"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={DollarSign} label="Receita Total" value={fi?.totalRevenue ?? 0} prev={fi?.totalRevenuePrev ?? null} format="compact" color="text-green-600" loading={isLoading} prevValue={fmtCompact(fi?.totalRevenuePrev ?? 0)} />
            <KpiCard icon={TrendingDown} label="Despesas Totais" value={fi?.totalExpenses ?? 0} prev={fi?.totalExpensesPrev ?? null} format="compact" color="text-red-600" loading={isLoading} invert prevValue={fmtCompact(fi?.totalExpensesPrev ?? 0)} />
            <KpiCard icon={TrendingUp} label="Lucro Líquido" value={fi?.netProfit ?? 0} prev={fi?.netProfitPrev ?? null} format="compact" color={(fi?.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"} loading={isLoading} prevValue={fmtCompact(fi?.netProfitPrev ?? 0)} />
            <KpiCard icon={Target} label="Margem de Lucro" value={fi?.profitMargin ?? 0} prev={fi?.profitMarginPrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(fi?.profitMarginPrev ?? 0)} />
            <KpiCard icon={Award} label="Comissões Pagas" value={fi?.commissions ?? 0} prev={fi?.commissionsPrev ?? null} format="compact" color="text-yellow-600" loading={isLoading} prevValue={fmtCompact(fi?.commissionsPrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Ticket Médio" value={fi?.avgTicket ?? 0} prev={fi?.avgTicketPrev ?? null} format="compact" color="text-purple-600" loading={isLoading} prevValue={fmtCompact(fi?.avgTicketPrev ?? 0)} />
            <KpiCard icon={ArrowUpRight} label="A Receber" value={fi?.receivable ?? 0} format="compact" color="text-blue-600" loading={isLoading} />
            <KpiCard icon={ArrowDownRight} label="A Pagar" value={fi?.payable ?? 0} format="compact" color="text-orange-600" loading={isLoading} />
          </div>

          {!isLoading && fi && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">DRE — Demonstrativo de Resultado</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Receita Bruta</span>
                    <span className="font-semibold text-green-600">{fmt(fi.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">(-) Despesas</span>
                    <span className="font-semibold text-red-600">- {fmt(fi.totalExpenses)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">(-) Comissões</span>
                    <span className="font-semibold text-yellow-700">- {fmt(fi.commissions)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">Lucro Líquido</span>
                    <span className={`font-bold text-base ${fi.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fi.netProfit >= 0 ? "+" : ""}{fmt(fi.netProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Margem de Lucro</span>
                    <span className={`font-semibold ${fi.profitMargin >= 20 ? "text-emerald-600" : fi.profitMargin >= 10 ? "text-yellow-600" : "text-red-600"}`}>
                      {fmtPct(fi.profitMargin)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Inadimplência (vencido)</span>
                    <span className="font-semibold text-red-500">{fmt(fi.overdue)}</span>
                  </div>
                </CardContent>
              </Card>

              {fi.expenseCategories.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Despesas por Categoria</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {fi.expenseCategories.slice(0, 6).map((cat) => {
                      const max = fi.expenseCategories[0]?.total ?? 1;
                      return (
                        <div key={cat.category} className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground w-28 truncate shrink-0 capitalize">{cat.category}</span>
                          <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                            <div className="bg-red-400 h-4 rounded-full flex items-center justify-end pr-1" style={{ width: `${Math.max((cat.total / max) * 100, 4)}%` }}>
                              <span className="text-[10px] font-medium text-white"></span>
                            </div>
                          </div>
                          <span className="text-xs font-semibold w-20 text-right shrink-0">{fmtCompact(cat.total)}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── OPERACIONAL ───────────────────────────────────────────── */}
        <TabsContent value="operacional" className="mt-5 space-y-4">
          <SectionHeader
            icon={Map}
            title="Visão Operacional"
            description="Viagens, embarques, passageiros, ocupação e satisfação"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Map} label="Viagens Ativas" value={op?.activeTrips ?? 0} format="num" color="text-blue-600" loading={isLoading} />
            <KpiCard icon={Map} label="Novas Viagens" value={op?.newTrips ?? 0} prev={op?.newTripsPrev ?? null} format="num" color="text-indigo-600" loading={isLoading} prevValue={fmtNum(op?.newTripsPrev ?? 0)} />
            <KpiCard icon={BarChart2} label="Taxa de Ocupação" value={op?.occupancyRate ?? 0} format="pct" color="text-cyan-600" loading={isLoading} />
            <KpiCard icon={Navigation} label="Vagas Disponíveis" value={op?.totalAvailableSeats ?? 0} format="num" color="text-orange-500" loading={isLoading} sub="em viagens ativas" />
            <KpiCard icon={ShoppingCart} label="Reservas Confirmadas" value={op?.confirmedReservations ?? 0} prev={op?.confirmedReservationsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(op?.confirmedReservationsPrev ?? 0)} />
            <KpiCard icon={UserCheck} label="Check-in Realizados" value={op?.checkedInPassengers ?? 0} prev={op?.checkedInPassengersPrev ?? null} format="num" color="text-green-600" loading={isLoading} prevValue={fmtNum(op?.checkedInPassengersPrev ?? 0)} sub="passageiros embarcados" />
            <KpiCard icon={TrendingDown} label="Cancelamentos" value={op?.cancellations ?? 0} prev={op?.cancellationsPrev ?? null} format="num" color="text-red-600" loading={isLoading} invert prevValue={fmtNum(op?.cancellationsPrev ?? 0)} />
            <KpiCard icon={Package} label="Fornecedores" value={op?.totalSuppliers ?? 0} format="num" color="text-purple-600" loading={isLoading} sub={`+${op?.newSuppliers ?? 0} este período`} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {!isLoading && op && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Eficiência Operacional</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Reservas por viagem</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{op.avgReservationsPerTrip.toFixed(1)}</span>
                      <GrowthBadge value={pctChange(op.avgReservationsPerTrip, op.avgReservationsPerTripPrev)} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Receita por viagem</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{fmtCompact(op.revenuePerTrip)}</span>
                      <GrowthBadge value={pctChange(op.revenuePerTrip, op.revenuePerTripPrev)} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Vagas disponíveis</span>
                    <span className="font-semibold">{op.totalAvailableSeats}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Check-ins realizados</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-green-600">{op.checkedInPassengers}</span>
                      <GrowthBadge value={pctChange(op.checkedInPassengers, op.checkedInPassengersPrev)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <NpsCard averageNps={op?.averageNps} averageNpsPrev={op?.averageNpsPrev} />
          </div>
        </TabsContent>

        {/* ─── RETENÇÃO ──────────────────────────────────────────────── */}
        <TabsContent value="retencao" className="mt-5 space-y-4">
          <SectionHeader
            icon={Heart}
            title="Retenção & Comunidade"
            description="Fidelidade, NPS, indicações e engajamento da base de clientes"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Repeat2} label="Clientes Recorrentes" value={re?.repeatClients ?? 0} prev={re?.repeatClientsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(re?.repeatClientsPrev ?? 0)} sub="compraram ≥2x" />
            <KpiCard icon={Target} label="Taxa de Retenção" value={re?.retentionRate ?? 0} prev={re?.retentionRatePrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(re?.retentionRatePrev ?? 0)} />
            <KpiCard icon={ArrowUpRight} label="Taxa de Indicação" value={re?.referralRate ?? 0} prev={re?.referralRatePrev ?? null} format="pct" color="text-orange-600" loading={isLoading} prevValue={fmtPct(re?.referralRatePrev ?? 0)} />
            <KpiCard icon={Star} label="Membros Fidelidade" value={re?.loyaltyMembers ?? 0} format="num" color="text-yellow-600" loading={isLoading} sub={`${re?.loyaltyActiveMembers ?? 0} ativos`} />
            <KpiCard icon={Award} label="Clientes Promotores" value={re?.promoterClients ?? 0} prev={re?.promoterClientsPrev ?? null} format="num" color="text-green-600" loading={isLoading} prevValue={fmtNum(re?.promoterClientsPrev ?? 0)} sub="NPS ≥ 9" />
            <KpiCard icon={CheckCircle2} label="Indicações Convertidas" value={re?.convertedReferrals ?? 0} prev={re?.convertedReferralsPrev ?? null} format="num" color="text-cyan-600" loading={isLoading} prevValue={fmtNum(re?.convertedReferralsPrev ?? 0)} />
            <KpiCard icon={Users} label="Novos Clientes" value={re?.newClients ?? 0} prev={re?.newClientsPrev ?? null} format="num" color="text-blue-600" loading={isLoading} prevValue={fmtNum(re?.newClientsPrev ?? 0)} />
            <KpiCard icon={Users} label="Total de Clientes" value={re?.totalClients ?? 0} format="num" color="text-gray-600" loading={isLoading} />
          </div>

          <NpsCard averageNps={re?.averageNps} averageNpsPrev={re?.averageNpsPrev} />

          {!isLoading && re && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Base de Clientes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Total de clientes</span>
                    <span className="font-semibold">{re.totalClients}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Novos no período</span>
                    <span className="font-semibold text-green-600">+{re.newClients}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Recorrentes (≥2 compras)</span>
                    <span className="font-semibold text-blue-600">{re.repeatClients}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Taxa de retenção</span>
                    <span className="font-semibold text-indigo-600">{fmtPct(re.retentionRate)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Taxa de indicação</span>
                    <span className="font-semibold text-orange-600">{fmtPct(re.referralRate)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Programa de Fidelidade & Promotores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Total de membros</span>
                    <span className="font-semibold">{re.loyaltyMembers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Membros ativos (último ano)</span>
                    <span className="font-semibold text-yellow-600">{re.loyaltyActiveMembers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Novos membros (período)</span>
                    <span className="font-semibold text-green-600">+{re.loyaltyNewMembers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Clientes promotores (NPS ≥ 9)</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-green-600">{re.promoterClients}</span>
                      <GrowthBadge value={pctChange(re.promoterClients, re.promoterClientsPrev)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── EXPANSÃO ──────────────────────────────────────────────── */}
        <TabsContent value="expansao" className="mt-5 space-y-4">
          <SectionHeader
            icon={Globe}
            title="Expansão & Inovação"
            description="Crescimento de portfólio, novos destinos, parceiros e receita"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Map} label="Novas Viagens" value={ex2?.newTrips ?? 0} prev={ex2?.newTripsPrev ?? null} format="num" color="text-blue-600" loading={isLoading} prevValue={fmtNum(ex2?.newTripsPrev ?? 0)} />
            <KpiCard icon={Globe} label="Novos Destinos (90d)" value={ex2?.newDestinations90d ?? 0} prev={ex2?.newDestinationsPrev90d ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(ex2?.newDestinationsPrev90d ?? 0)} sub={`${ex2?.totalDestinations ?? 0} destinos cadastrados`} />
            <KpiCard icon={Package} label="Novos Fornecedores" value={ex2?.newSuppliers ?? 0} prev={ex2?.newSuppliersPrev ?? null} format="num" color="text-indigo-600" loading={isLoading} prevValue={fmtNum(ex2?.newSuppliersPrev ?? 0)} sub={`${ex2?.totalSuppliers ?? 0} total`} />
            <KpiCard icon={DollarSign} label="Receita / Viagem" value={ex2?.revenuePerTrip ?? 0} prev={ex2?.revenuePerTripPrev ?? null} format="compact" color="text-green-600" loading={isLoading} prevValue={fmtCompact(ex2?.revenuePerTripPrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Ticket Médio" value={ex2?.avgTicket ?? 0} prev={ex2?.avgTicketPrev ?? null} format="compact" color="text-purple-600" loading={isLoading} prevValue={fmtCompact(ex2?.avgTicketPrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Receita Total" value={ex2?.totalRevenue ?? 0} prev={ex2?.totalRevenuePrev ?? null} format="compact" color="text-emerald-600" loading={isLoading} prevValue={fmtCompact(ex2?.totalRevenuePrev ?? 0)} />
            {!isLoading && ex2?.momGrowth != null && (
              <KpiCard icon={TrendingUp} label="Crescimento MoM" value={ex2.momGrowth} format="pct" color={ex2.momGrowth >= 0 ? "text-green-600" : "text-red-600"} loading={isLoading} sub="mês vs. mês anterior" />
            )}
            {!isLoading && ex2?.yoyGrowth != null && (
              <KpiCard icon={TrendingUp} label="Crescimento YoY" value={ex2.yoyGrowth} format="pct" color={ex2.yoyGrowth >= 0 ? "text-green-600" : "text-red-600"} loading={isLoading} sub="ano vs. ano anterior" />
            )}
          </div>

          {!isLoading && ex2 && (
            <div className="grid gap-4 md:grid-cols-2">
              {ex2.topDestinations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="w-4 h-4" /> Top Destinos no Período
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ex2.topDestinations.map((d, i) => {
                      const max = ex2.topDestinations[0]?.count ?? 1;
                      return (
                        <div key={d.name} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">{i + 1}</span>
                          <span className="text-sm text-muted-foreground w-32 truncate shrink-0">{d.name}</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full" style={{ width: `${(d.count / max) * 100}%` }} />
                          </div>
                          <span className="text-xs font-semibold w-8 text-right">{d.count}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Crescimento de Receita</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Receita Total</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{fmtCompact(ex2.totalRevenue)}</span>
                      <GrowthBadge value={pctChange(ex2.totalRevenue, ex2.totalRevenuePrev)} />
                    </div>
                  </div>
                  {ex2.momGrowth != null && (
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-muted-foreground">Crescimento MoM</span>
                      <GrowthBadge value={ex2.momGrowth} />
                    </div>
                  )}
                  {ex2.yoyGrowth != null && (
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-muted-foreground">Crescimento YoY</span>
                      <GrowthBadge value={ex2.yoyGrowth} />
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Total de Fornecedores</span>
                    <span className="font-semibold">{ex2.totalSuppliers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Destinos cadastrados</span>
                    <span className="font-semibold">{ex2.totalDestinations}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Novos destinos (90d)</span>
                    <span className="font-semibold text-teal-600">+{ex2.newDestinations90d}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {chatOpen && (
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Assistente de Inteligência Turística
              <Badge variant="secondary" className="text-xs font-normal">IA</Badge>
            </CardTitle>
            <button
              onClick={() => setChatOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </CardHeader>
          <CardContent className="p-0 pb-0">
            <InsightsChat period={period} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
