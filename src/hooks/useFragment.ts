import { getApolloContext } from '@apollo/client';
import { useContext } from 'react';
import { useOnce } from './utils';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { DocumentNode } from 'graphql';
import { buildWatchFragmentQuery } from '../client/utils';
import { FragmentHookOptions } from './types';
import { useFragmentTypePolicyFieldName } from './useFragmentTypePolicyFieldName';
import { useQueryDataByFieldName } from './useGetQueryDataByFieldName';

interface UseFragmentOptions extends FragmentHookOptions {
  id: string;
}

// A hook for subscribing to a fragment in the Apollo cache from a React component.
export default function useFragment<FragmentType>(fragment: DocumentNode, options: UseFragmentOptions) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;
  const fieldName = useFragmentTypePolicyFieldName();
  const { id, ...queryOptions } = options;

  const query = useOnce(() => buildWatchFragmentQuery({
    id,
    fragment,
    fieldName,
    policies: cache.policies,
  }));

  return useQueryDataByFieldName<FragmentType | null>({
    fieldName,
    query: query,
    options: queryOptions,
  });
}
