import { getApolloContext } from '@apollo/client';
import { useContext } from 'react';
import { DocumentNode } from 'graphql';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { buildWatchFragmentWhereQuery } from '../client/utils';
import { FragmentWhereFilter } from '../cache/types';
import { useOnce } from './utils';
import { useFragmentTypePolicyFieldName } from './useFragmentTypePolicyFieldName';
import { useQueryForFragment } from './useQueryForFragment';

export default function useFragmentWhere<FragmentType>(fragment: DocumentNode, filter?: FragmentWhereFilter<FragmentType>) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;
  const fieldName = useFragmentTypePolicyFieldName();

  const query = useOnce(() => buildWatchFragmentWhereQuery({
    filter,
    fragment,
    fieldName,
    cache,
    policies: cache.policies,
  }));

  return useQueryForFragment<FragmentType[]>(query, fieldName);
}

