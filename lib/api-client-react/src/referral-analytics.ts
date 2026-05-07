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

export const getReferralExportUrl = (status?: string, search?: string) => {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (search) params.set("search", search);
  const qs = params.toString();
  return qs ? `/api/referrals/export?${qs}` : `/api/referrals/export`;
};
