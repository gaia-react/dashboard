import type {ApiResourceState} from '~/hooks/useApiResource';

/**
 * Some sections (DashboardHeader, KpiRow, ParseHealth) read fields from both
 * `/api/costs` and `/api/activity`; they can only render once both resources
 * have resolved. This folds the two independent resource states into one:
 * error if either side errored, loading until both sides succeed, success
 * with both payloads once they have.
 */
export const combineResourceStates = <CostsData, ActivityData>(
  costs: ApiResourceState<CostsData>,
  activity: ApiResourceState<ActivityData>
): ApiResourceState<{activity: ActivityData; costs: CostsData}> => {
  if (costs.status === 'error') {
    return {message: costs.message, status: 'error'};
  }

  if (activity.status === 'error') {
    return {message: activity.message, status: 'error'};
  }

  if (costs.status === 'success' && activity.status === 'success') {
    return {
      data: {activity: activity.data, costs: costs.data},
      status: 'success',
    };
  }

  return {status: 'loading'};
};
