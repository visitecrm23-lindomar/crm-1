import { useLocation } from "wouter";
import { Lock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PlanLimitWallProps {
  resource: "users" | "clients" | "trips";
  current?: number;
  limit?: number;
  planId?: string;
}

const RESOURCE_LABELS: Record<string, string> = {
  users: "usuários",
  clients: "clientes",
  trips: "viagens",
};

const RESOURCE_DESCRIPTIONS: Record<string, string> = {
  users: "Você atingiu o limite de usuários do seu plano atual.",
  clients: "Você atingiu o limite de clientes do seu plano atual.",
  trips: "Você atingiu o limite de viagens do seu plano atual.",
};

export function PlanLimitWall({ resource, current, limit, planId }: PlanLimitWallProps) {
  const [, navigate] = useLocation();

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <Lock className="w-5 h-5" />
          Limite do plano atingido
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-amber-700">
          {RESOURCE_DESCRIPTIONS[resource] ?? `Limite de ${RESOURCE_LABELS[resource] ?? resource} atingido.`}
        </p>
        {current !== undefined && limit !== undefined && (
          <div className="text-sm font-medium text-amber-800">
            {current} de {limit} {RESOURCE_LABELS[resource] ?? resource} utilizados
          </div>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => navigate("/configuracoes?tab=plan")}
          >
            <TrendingUp className="w-4 h-4 mr-1" />
            Fazer upgrade
          </Button>
        </div>
        <p className="text-xs text-amber-600">
          Faça upgrade do seu plano para adicionar mais {RESOURCE_LABELS[resource] ?? resource}.
        </p>
      </CardContent>
    </Card>
  );
}

export function usePlanLimitError(error: unknown): {
  isLimitError: boolean;
  resource?: string;
  current?: number;
  limit?: number;
  message?: string;
} {
  if (!error || typeof error !== "object") return { isLimitError: false };
  const e = error as Record<string, unknown>;
  if (e["error"] === "limit_exceeded" || (e["message"] as string)?.includes("Limite do plano")) {
    return {
      isLimitError: true,
      resource: e["resource"] as string,
      current: e["current"] as number,
      limit: e["limit"] as number,
      message: e["message"] as string,
    };
  }
  return { isLimitError: false };
}
