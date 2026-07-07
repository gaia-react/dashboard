import {expect, test} from 'vitest';
import {combineResourceStates} from '~/hooks/combineResourceStates';
import type {ApiResourceState} from '~/hooks/useApiResource';

const loading: ApiResourceState<never> = {status: 'loading'};
const costsSuccess: ApiResourceState<{value: number}> = {
  data: {value: 1},
  status: 'success',
};
const activitySuccess: ApiResourceState<{value: string}> = {
  data: {value: 'a'},
  status: 'success',
};
const costsError: ApiResourceState<{value: number}> = {
  message: 'costs failed',
  status: 'error',
};
const activityError: ApiResourceState<{value: string}> = {
  message: 'activity failed',
  status: 'error',
};

test('loading until both resources succeed', () => {
  expect(combineResourceStates(loading, activitySuccess)).toEqual({
    status: 'loading',
  });
  expect(combineResourceStates(costsSuccess, loading)).toEqual({
    status: 'loading',
  });
});

test('success with both payloads once both resolve', () => {
  expect(combineResourceStates(costsSuccess, activitySuccess)).toEqual({
    data: {activity: {value: 'a'}, costs: {value: 1}},
    status: 'success',
  });
});

test('an error on either side surfaces as error, regardless of the other side', () => {
  expect(combineResourceStates(costsError, activitySuccess)).toEqual({
    message: 'costs failed',
    status: 'error',
  });
  expect(combineResourceStates(costsSuccess, activityError)).toEqual({
    message: 'activity failed',
    status: 'error',
  });
  expect(combineResourceStates(costsError, loading)).toEqual({
    message: 'costs failed',
    status: 'error',
  });
});
