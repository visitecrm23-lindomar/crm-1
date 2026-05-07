import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions, UseQueryResult, QueryKey } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

export type ReferralAnalyticsPeriod = 30 | 90 | 180;

export interface ReferralAnalyticsSeries {
  week: string;
  created: number;
  converted: number;
}

export interface ReferralAnalyticsFunnel {
  created: number;
  visited: number;
  converted: number;
  bonusPaid: number;
}

export interface ReferralAnalyticsData {
  series: ReferralAnalyticsSeries[];
  funnel: ReferralAnalyticsFunnel;
  conversionRate: number;
  prevConversionRate: number;
}

export const getReferralAnalyticsUrl = (period: ReferralAnalyticsPeriod) =>
  `/api/referrals/analytics?period=${period}`;

export const getReferralAnalytics = (period: ReferralAnalyticsPeriod, options?: RequestInit) =>
  customFetch<ReferralAnalyticsData>(getReferralAnalyticsUrl(period), { ...options, method: "GET" });

export const getReferralAnalyticsQueryKey = (period: ReferralAnalyticsPeriod) =>
  [`/api/referrals/analytics`, period] as const;

export function useGetReferralAnalytics<
  TData = ReferralAnalyticsData,
  TError = ErrorType<unknown>,
>(
  period: ReferralAnalyticsPeriod,
  options?: {
    query?: UseQueryOptions<ReferralAnalyticsData, TError, TData>;
    request?: RequestInit;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getReferralAnalyticsQueryKey(period);

  const queryFn = ({ signal }: { signal?: AbortSignal }) =>
    getReferralAnalytics(period, { signal, ...requestOptions });

  const query = useQuery({
    queryKey,
    queryFn,
    ...queryOptions,
  }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return { ...query, queryKey };
}

export interface ReferralExportFilters {
  status?: string;
  search?: string;
  bonusPaid?: boolean;
  fraudFlag?: boolean;
  expiringSoon?: boolean;
}

export const getReferralExportUrl = (filters: ReferralExportFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.bonusPaid === false) params.set("bonusPaid", "false");
  if (filters.fraudFlag === true) params.set("fraudFlag", "true");
  if (filters.expiringSoon === true) params.set("expiringSoon", "true");
  const qs = params.toString();
  return qs ? `/api/referrals/export?${qs}` : `/api/referrals/export`;
};
