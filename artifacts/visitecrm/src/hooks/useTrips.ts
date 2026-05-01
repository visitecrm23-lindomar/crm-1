import { useState, useMemo } from "react";
import {
  useListTrips, useDeleteTrip, useUpdateTrip,
  useGetDashboardUpcomingTrips, useGetMe,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 10;

export function useTrips() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: me } = useGetMe();
  const isVendedor = me?.role === "vendedor";

  const { data: tripsData, isLoading, refetch } = useListTrips({
    search: search || undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    limit: PAGE_SIZE,
  });

  const { data: upcomingTrips = [] } = useGetDashboardUpcomingTrips();
  const { data: allTrips } = useListTrips({ limit: 100 });

  const deleteTrip = useDeleteTrip();
  const updateTrip = useUpdateTrip();

  const trips = tripsData?.data ?? [];
  const total = tripsData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const upcomingMap = useMemo(() => {
    const m = new Set<string>();
    for (const t of upcomingTrips) m.add(t.id);
    return m;
  }, [upcomingTrips]);

  const handleDelete = async (id: string) => {
    try {
      await deleteTrip.mutateAsync({ id });
      refetch();
      toast({ title: "Viagem excluída com sucesso" });
    } catch {
      toast({ title: "Erro ao excluir viagem", variant: "destructive" });
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      await updateTrip.mutateAsync({ id, data: { status: nextStatus } });
      refetch();
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    }
  };

  return {
    trips, isLoading, total, totalPages, allTrips, upcomingMap,
    me, isVendedor,
    search, setSearch,
    typeFilter, setTypeFilter,
    statusFilter, setStatusFilter,
    page, setPage,
    refetch, handleDelete, handleToggleStatus,
  };
}
