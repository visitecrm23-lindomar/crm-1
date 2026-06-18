import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import type { ClientPortalProfile, ClientLoyaltyTransaction } from "@/lib/types";

const TIER_LABELS: Record<string, string> = {
  bronze: "Bronze",
  silver: "Prata",
  gold: "Ouro",
  diamond: "Diamante",
};

const TIER_ICONS: Record<string, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
  diamond: "💎",
};

const TIER_COLORS: Record<string, [string, string]> = {
  bronze: ["#92400e", "#fef3c7"],
  silver: ["#374151", "#f3f4f6"],
  gold: ["#92400e", "#fef9c3"],
  diamond: ["#0e7490", "#ecfeff"],
};

function TransactionItem({
  tx,
  colors,
}: {
  tx: ClientLoyaltyTransaction;
  colors: ReturnType<typeof useColors>;
}) {
  const isPositive = tx.points > 0;
  const date = new Date(tx.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <View style={[styles.txItem, { borderBottomColor: colors.border }]}>
      <View style={[
        styles.txIcon,
        { backgroundColor: isPositive ? colors.successLight : "#fee2e2" },
      ]}>
        <Feather
          name={isPositive ? "arrow-up-right" : "arrow-down-left"}
          size={16}
          color={isPositive ? colors.success : colors.destructive}
        />
      </View>
      <View style={styles.txInfo}>
        <Text style={[styles.txDesc, { color: colors.foreground }]} numberOfLines={2}>
          {tx.description}
        </Text>
        <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{date}</Text>
      </View>
      <Text
        style={[
          styles.txPoints,
          { color: isPositive ? colors.success : colors.destructive },
        ]}
      >
        {isPositive ? "+" : ""}
        {tx.points.toLocaleString("pt-BR")} pts
      </Text>
    </View>
  );
}

export default function FidelidadeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();

  const { data, isLoading, error, refetch, isRefetching } = useQuery<ClientPortalProfile>({
    queryKey: ["client-profile"],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<ClientPortalProfile>(token, "GET", "/client/me");
    },
  });

  const loyalty = data?.loyalty ?? null;
  const tier = loyalty?.tier ?? "bronze";
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const tierIcon = TIER_ICONS[tier] ?? "⭐";
  const [tierFg, tierBg] = TIER_COLORS[tier] ?? [colors.primary, colors.secondary];

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !loyalty) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="star" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          {error ? "Erro ao carregar" : "Programa de fidelidade inativo"}
        </Text>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          {error instanceof Error
            ? error.message
            : "Sua agência ainda não ativou o programa de fidelidade."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.scroll,
        { paddingBottom: insets.bottom + 100 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
    >
      {/* Points card */}
      <View style={[styles.pointsCard, { backgroundColor: colors.primary }]}>
        <View style={styles.pointsCardDecor1} />
        <View style={styles.pointsCardDecor2} />
        <Text style={styles.pointsLabel}>
          {loyalty.programName || "Pontos disponíveis"}
        </Text>
        <Text style={styles.pointsValue}>
          {loyalty.availablePoints.toLocaleString("pt-BR")}
          <Text style={styles.pointsPts}> PTS</Text>
        </Text>
        <View style={[styles.tierBadge, { backgroundColor: tierBg }]}>
          <Text style={[styles.tierBadgeText, { color: tierFg }]}>
            {tierIcon} {tierLabel}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>
            {loyalty.totalPoints.toLocaleString("pt-BR")}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total ganho</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>
            {loyalty.pointsPerReal}x
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Pts por R$</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>
            {loyalty.minRedeemPoints.toLocaleString("pt-BR")}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Mín. resgate</Text>
        </View>
      </View>

      {/* Recent transactions */}
      {loyalty.recentTransactions.length > 0 ? (
        <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Últimas transações
          </Text>
          {loyalty.recentTransactions.map((tx) => (
            <TransactionItem key={tx.id} tx={tx} colors={colors} />
          ))}
        </View>
      ) : (
        <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Transações</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, textAlign: "center", paddingVertical: 24 }]}>
            Nenhuma transação ainda.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  scroll: {
    padding: 16,
    gap: 12,
  },
  pointsCard: {
    borderRadius: 20,
    padding: 24,
    overflow: "hidden",
    gap: 8,
    alignItems: "flex-start",
  },
  pointsCardDecor1: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  pointsCardDecor2: {
    position: "absolute",
    bottom: -40,
    left: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pointsLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.75)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  pointsValue: {
    fontSize: 44,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    lineHeight: 52,
  },
  pointsPts: {
    fontSize: 22,
    fontFamily: "Inter_500Medium",
  },
  tierBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
  },
  tierBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  txCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  txItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txDesc: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  txDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  txPoints: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
