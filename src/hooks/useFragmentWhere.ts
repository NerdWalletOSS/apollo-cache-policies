import { getApolloContext, useQuery } from '@apollo/client';
import { useContext, useMemo } from 'react';
import { DocumentNode } from 'graphql';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { buildWatchFragmentWhereQuery } from '../client/utils';

export default function useFragmentWhere<FragmentType>(fragment: DocumentNode, filters: Partial<Record<keyof FragmentType, any>>) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;

  const query = useMemo(() => buildWatchFragmentWhereQuery({
    filters,
    fragment,
    cache,
    policies: cache.policies,
  }), []);

  return useQuery(query, {
    fetchPolicy: 'cache-only',
  });
}
