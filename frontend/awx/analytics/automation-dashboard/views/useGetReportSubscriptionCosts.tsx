import { useGet } from '../../../../common/crud/useGet';
import { ISubscriptionCosts } from '../types';
import { metricsAPI } from '../../../common/api/metrics-utils';

interface IGetReportSubscriptionCosts {
  subscriptionCosts: ISubscriptionCosts[] | undefined;
  refresh: () => void;
  isLoading: boolean;
  error: Error | undefined;
}

export const SUBSCRIPTION_COSTS_URL = metricsAPI`/dashboard_reports/subscription_costs/`;

export function subscriptionCostsUrl(
  organizationId: number | undefined = undefined,
  useGlobalSettings = false
): string {
  if (useGlobalSettings || organizationId === undefined) {
    return SUBSCRIPTION_COSTS_URL;
  }
  return `${SUBSCRIPTION_COSTS_URL}?organization=${organizationId}`;
}

export function useGetReportSubscriptionCosts(
  organizationId: number | undefined = undefined,
  useGlobalSettings = false
): IGetReportSubscriptionCosts {
  const {
    data: subscriptionCosts,
    refresh,
    isLoading,
    error,
  } = useGet<ISubscriptionCosts[]>(subscriptionCostsUrl(organizationId, useGlobalSettings));

  return { subscriptionCosts, refresh, isLoading, error };
}
