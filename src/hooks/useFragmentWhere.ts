import { getApolloContext } from '@apollo/client';
import { useContext, useEffect, useRef } from 'react';
import { DocumentNode } from 'graphql';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { buildWatchFragmentWhereQuery } from '../client/utils';
import { FragmentWhereFilter } from '../cache/types';
import { useOnce } from './utils';
import { useFragmentTypePolicyFieldName } from './useFragmentTypePolicyFieldName';
import { useGetQueryDataByFieldName } from './useGetQueryDataByFieldName';
import { makeVar } from '@apollo/client';
import { equal } from '@wry/equality';

// A hook for subscribing to a fragment for entities in the Apollo cache matching a given filter from a React component.
export default function useFragmentWhere<FragmentType>(fragment: DocumentNode, filter?: FragmentWhereFilter<FragmentType>) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;
  const fieldName = useFragmentTypePolicyFieldName();
  const filterVarRef = useRef(makeVar<FragmentWhereFilter<FragmentType> | undefined>(filter));
  const filterVar = filterVarRef.current;

  useEffect(() => {
    if (!equal(filter, filterVar())) {
      filterVar(filter);
    }
  }, [filter]);

  const query = useOnce(() => buildWatchFragmentWhereQuery({
    filter,
    filterVar,
    fragment,
    fieldName,
    cache,
    policies: cache.policies,
  }));

  return useGetQueryDataByFieldName<FragmentType[]>(query, fieldName);
}

