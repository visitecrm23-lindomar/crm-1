import { useState, useMemo } from "react";
import {
  useListReservations, useGetReservationStats,
  useUpdateReservation, useCheckInReservation,
  useListTrips, useListUsers, useListBoardingLocations,
} from "@workspace/api-client-react";
import type { Reservation } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ROLES, RESERVATION_STATUS } from "@workspace/permissions";

export interface UseReservationsOptions {
  initialTripFilter?: string;
}

export function useReservations(options?: UseReservationsOptions) {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tripFilter, setTripFilter] = useState(options?.initialTripFilter ?? "");
  const [sellerFilter, setSellerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasAutoRetryFilter, setHasAutoRetryFilter] = useState(false);
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 20;

  const { data, isLoading, refetch } = useListReservations({
    status: statusFilter || undefined,
    tripId: tripFilter || undefined,
    search: search || undefined,
    createdById: sellerFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    hasAutoRetry: hasAutoRetryFilter || undefined,
    page,
    limit: PAGE_SIZE,
  });

  const { data: stats, refetch: refetchStats } = useGetReservationStats();
  const { data: tripsData } = useListTrips({ limit: 100 });
  const { data: usersRaw } = useListUsers();
  const { data: boardingRaw } = useListBoardingLocations();

  const updateReservation = useUpdateReservation();
  const checkInReservation = useCheckInReservation();

  const sellers = useMemo(
    () => (usersRaw ?? []).filter(u => u.role === ROLES.SALES || u.role === ROLES.AGENCY_ADMIN),
    [usersRaw],
  );

  const boardingMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of (boardingRaw ?? [])) m[b.id] = b.name;
    return m;
  }, [boardingRaw]);

  const reservations = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleCheckin = async (r: Reservation) => {
    try {
      await checkInReservation.mutateAsync({ id: r.id });
      refetch();
      refetchStats();
    } catch {
      toast({ title: "Não foi possível confirmar o check-in", description: "Tente novamente ou contate o suporte.", variant: "destructive" });
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await updateReservation.mutateAsync({ id, data: { status: RESERVATION_STATUS.CANCELLED } });
      refetch();
      refetchStats();
    } catch {
      toast({ title: "Não foi possível cancelar a reserva", description: "Tente novamente ou contate o suporte.", variant: "destructive" });
    }
  };

  return {
    reservations, isLoading, total, totalPages, stats,
    tripsData, sellers, boardingMap,
    search, setSearch,
    statusFilter, setStatusFilter,
    tripFilter, setTripFilter,
    sellerFilter, setSellerFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    hasAutoRetryFilter, setHasAutoRetryFilter,
    page, setPage,
    refetch, refetchStats,
    handleCheckin, handleCancel,
  };
}
