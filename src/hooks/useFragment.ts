import { getApolloContext, useQuery } from '@apollo/client';
import { useContext, useMemo } from 'react';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { DocumentNode } from 'graphql';
import { buildWatchFragmentQuery } from '../client/utils';

interface UseFragmentOptions {
  id: string;
}

export default function useFragment(fragment: DocumentNode, options: UseFragmentOptions) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;

  const query = useMemo(() => buildWatchFragmentQuery({
    fragment,
    id: options.id,
    policies: cache.policies,
  }), []);

  return useQuery(query, {
    fetchPolicy: 'cache-only',
  });
}
