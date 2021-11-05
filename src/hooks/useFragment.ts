import { getApolloContext, useQuery } from '@apollo/client';
import { useContext, useRef } from 'react';
import { useOnce } from './utils';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { DocumentNode } from 'graphql';
import { buildWatchFragmentQuery } from '../client/utils';
import { uuid } from 'uuidv4';
import { useTeardownFragmentTypePolicy } from './useTeardownFragmentTypePolicy';

interface UseFragmentOptions {
  id: string;
}

export default function useFragment(fragment: DocumentNode, options: UseFragmentOptions) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;
  const { current: fieldName } = useRef(uuid());

  useTeardownFragmentTypePolicy(fieldName);

  const query = useOnce(() => buildWatchFragmentQuery({
    fragment,
    fieldName,
    id: options.id,
    policies: cache.policies,
  }));

  const result = useQuery(query, {
    fetchPolicy: 'cache-only',
  });

  return {
    ...result,
    data: result?.data?.[fieldName]
  };
}
