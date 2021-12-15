import { getApolloContext } from '@apollo/client';
import { useContext } from 'react';
import { DocumentNode } from 'graphql';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { buildWatchFragmentWhereQuery } from '../client/utils';
import { FragmentWhereFilter } from '../cache/types';
import { useOnce } from './utils';
import { useQueryDataByFieldName } from './useGetQueryDataByFieldName';
import { FragmentHookOptions } from './types';
import { useFragmentTypePolicyFieldName } from './useFragmentTypePolicyFieldName';

interface UseFragmentWhereOptions<FragmentType> extends FragmentHookOptions {
  filter?: FragmentWhereFilter<FragmentType>;
}

// A hook for subscribing to a fragment for entities in the Apollo cache matching a given filter from a React component.
export default function useFragmentWhere<FragmentType>(fragment: DocumentNode, options: UseFragmentWhereOptions<FragmentType> = {}) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;
  const fieldName = useFragmentTypePolicyFieldName();
  const { filter, fragmentName, ...queryOptions } = options;

  const query = useOnce(() => buildWatchFragmentWhereQuery({
    filter,
    fragment,
    fieldName,
    fragmentName,
    cache,
    policies: cache.policies,
  }));

  return useQueryDataByFieldName<FragmentType[]>({
    query,
    fieldName,
    options: queryOptions,
  });
}

