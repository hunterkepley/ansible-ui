import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { ISubscriptionCosts } from '../types';
import {
  subscriptionCostsUrl,
  useGetReportSubscriptionCosts,
} from './useGetReportSubscriptionCosts';

interface ISubscriptionCostState {
  costState: ISubscriptionCosts | undefined;
  setCostState: Dispatch<SetStateAction<ISubscriptionCosts | undefined>>;
}

/**
 * Manages the subscription cost state synced with the server.
 *
 * Uses a pristine flag to prevent background SWR revalidations from
 * overwriting uncommitted local edits:
 *
 * - State is re-seeded only while `isPristine === true`.
 * - `isPristine` is reset to `true` whenever `subscriptionCosts` changes
 *   (initial load or confirmed save / remote update), so future server
 *   values are always accepted after a round-trip.
 * - `isPristine` is set to `false` whenever the caller mutates state
 *   locally via `setCostState`, protecting pending edits from being
 *   overwritten by a same-cycle SWR revalidation.
 *
 * `setCostState` is called with the server-confirmed record after a save. That
 * record is also written into the SWR cache of the list GET, so remounting the
 * dashboard does not briefly show the value from before the save.
 */
export function useSubscriptionCostState(
  organizationId: number | undefined = undefined,
  useGlobalSettings = false
): ISubscriptionCostState {
  const { subscriptionCosts } = useGetReportSubscriptionCosts(organizationId, useGlobalSettings);
  const costsUrl = subscriptionCostsUrl(organizationId, useGlobalSettings);
  const [costState, setCostState] = useState<ISubscriptionCosts | undefined>(undefined);
  const [isPristine, setIsPristine] = useState(true);
  const { mutate } = useSWRConfig();

  // Reset to pristine whenever fresh server data arrives.
  // A change in `subscriptionCosts` represents a confirmed save or a remote
  // update, so the next guard effect will resync `costState` from the server.
  useEffect(() => {
    if (subscriptionCosts !== undefined) {
      setIsPristine(true);
    }
  }, [subscriptionCosts]);

  // Seed / resync only when pristine (no uncommitted local edits).
  useEffect(() => {
    if (subscriptionCosts !== undefined && isPristine) {
      setCostState(subscriptionCosts[0]);
    }
  }, [subscriptionCosts, isPristine]);

  // Wrap the setter: any caller-initiated edit marks the state as dirty so
  // background SWR revalidations with unchanged data cannot overwrite it.
  const handleSetCostState: Dispatch<SetStateAction<ISubscriptionCosts | undefined>> = useCallback(
    (value) => {
      setIsPristine(false);
      setCostState(value);
      if (value && typeof value !== 'function') {
        void mutate<ISubscriptionCosts[]>(
          costsUrl,
          (cached) => cached?.map((costs) => (costs.id === value.id ? value : costs)),
          { revalidate: false }
        );
      }
    },
    [costsUrl, mutate]
  );

  return { costState, setCostState: handleSetCostState };
}
