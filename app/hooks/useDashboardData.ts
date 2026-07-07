import type {ApiResource} from '~/hooks/useApiResource';
import {useApiResource} from '~/hooks/useApiResource';

export type DashboardData<CostsData, ActivityData> = {
  activity: ApiResource<ActivityData>;
  costs: ApiResource<CostsData>;
  refresh: () => void;
};

/**
 * Composes the two dashboard endpoints (PLAN D2). The resources are exposed
 * independently so cost sections paint immediately while activity sections
 * keep their skeletons until the session scan lands (SPEC section 4.5).
 *
 * Generics default to unknown until schemas/api.ts lands (Phase 2); the
 * integrator instantiates with CostsResponse / ActivityResponse.
 */
export const useDashboardData = <
  CostsData = unknown,
  ActivityData = unknown,
>(): DashboardData<CostsData, ActivityData> => {
  const {timeZone} = Intl.DateTimeFormat().resolvedOptions();
  const costs = useApiResource<CostsData>('/api/costs');
  const activity = useApiResource<ActivityData>(
    `/api/activity?tz=${encodeURIComponent(timeZone)}`
  );

  const refresh = (): void => {
    costs.refetch();
    activity.refetch();
  };

  return {activity, costs, refresh};
};
