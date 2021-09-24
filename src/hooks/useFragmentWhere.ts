import { getApolloContext, useQuery } from '@apollo/client';
import { useContext } from 'react';
import { DocumentNode } from 'graphql';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { buildWatchFragmentWhereQuery } from '../client/utils';
import { FragmentWhereFilter } from '../cache/types';
import { useOnce } from './utils';

export default function useFragmentWhere<FragmentType>(fragment: DocumentNode, filter?: FragmentWhereFilter<FragmentType>) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;

  const query = useOnce(() => buildWatchFragmentWhereQuery({
    filter,
    fragment,
    cache,
    policies: cache.policies,
  }));

  return useQuery(query, {
    fetchPolicy: 'cache-only',
  });
}
