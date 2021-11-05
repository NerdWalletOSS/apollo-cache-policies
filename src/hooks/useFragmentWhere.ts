import { getApolloContext, useQuery } from '@apollo/client';
import { useContext, useRef } from 'react';
import { uuid } from 'uuidv4';
import { DocumentNode } from 'graphql';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { buildWatchFragmentWhereQuery } from '../client/utils';
import { FragmentWhereFilter } from '../cache/types';
import { useOnce } from './utils';
import { useTeardownFragmentTypePolicy } from './useTeardownFragmentTypePolicy';

export default function useFragmentWhere<FragmentType>(fragment: DocumentNode, filter?: FragmentWhereFilter<FragmentType>) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;
  const { current: fieldName } = useRef(uuid());

  useTeardownFragmentTypePolicy(fieldName);

  const query = useOnce(() => buildWatchFragmentWhereQuery({
    filter,
    fragment,
    fieldName,
    cache,
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

