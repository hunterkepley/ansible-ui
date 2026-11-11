import { IAutomationDashboardCollectionStatus } from '../types';
import { useEffect, useMemo, useState } from 'react';
import { awxAPI } from '../../../common/api/awx-utils';
import { isRequestError } from '../../../../common/crud/RequestError';
import { mutate } from 'swr';
import { gatewayAPI } from '@ansible/platform-ui/utils/gateway-api-utils';
import { useCollectionStatus } from './useCollectionStatus';

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return isRequestError(error) && error.statusCode === statusCode;
}

const REFRESH_INTERVAL_MS = 10 * 1000;
const UNAVAILABLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const DEFAULT_STATUS: IAutomationDashboardCollectionStatus = {
  enabled: null,
  last_sync: null,
  show_dashboard: null,
  show_leaderboard: null,
};

export function useAutomationDashboardCollectionStatus(): {
  collectionStatus: IAutomationDashboardCollectionStatus;
  isLoading: boolean;
  /** Only the collection_status request itself is loading. */
  isRequestLoading: boolean;
  /** The server-side collection_status response says this caller may see the dashboard. */
  canSeeDashboard: boolean;
  canSeeLeaderboard: boolean;
  /** Fetch error when there is no data to fall back on; a 404 (no metrics service) is not an error. */
  error: Error | undefined;
  /** collection_status answered 404, i.e. there is no metrics service. */
  isUnavailable: boolean;
} {
  // A 404 means no metrics service (e.g. standalone AWX): poll rarely until it answers again
  const [isUnavailable, setIsUnavailable] = useState(false);
  const {
    data,
    error,
    isLoading: isSwrLoading,
  } = useCollectionStatus({
    // No dedupingInterval override: the global default lets concurrent callers share one request
    refreshInterval: isUnavailable ? UNAVAILABLE_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS,
    shouldRetryOnError: !isUnavailable,
  });

  useEffect(() => {
    // 401 = session expired: revalidate both /me/ queries so the login screen shows immediately;
    // the key for the provider that isn't mounted in this build is a no-op
    if (hasStatusCode(error, 401)) {
      void mutate(gatewayAPI`/me/`);
      void mutate(awxAPI`/me/`);
    }
    setIsUnavailable(hasStatusCode(error, 404));
  }, [error]);

  return useMemo(() => {
    // A failed poll keeps the last good data (SWR retains it), so one blip doesn't unmount the
    // dashboard or flip the nav; the error only surfaces when there is no data at all
    const isNotFound = hasStatusCode(error, 404);
    const collectionStatus = isNotFound ? DEFAULT_STATUS : (data ?? DEFAULT_STATUS);
    // Access is resolved server-side: global admin/auditor, organization dashboard role, or none.
    const canSeeDashboard = !!collectionStatus.show_dashboard;
    const canSeeLeaderboard = !!collectionStatus.show_leaderboard;
    return {
      collectionStatus,
      isLoading: isSwrLoading,
      isRequestLoading: isSwrLoading,
      canSeeDashboard,
      canSeeLeaderboard,
      error: data || isNotFound ? undefined : error,
      isUnavailable: isNotFound,
    };
  }, [data, error, isSwrLoading]);
}
