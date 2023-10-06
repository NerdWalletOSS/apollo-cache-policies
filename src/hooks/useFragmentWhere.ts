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
export default function useFragmentWhere<FragmentType>(fragment: DocumentNode, options?: {
  filter?: FragmentWhereFilter<FragmentType>;
  returnPartialData?: boolean;
  limit?: number;
}) {
  const filter = options?.filter;
  const limit = options?.limit;
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;
  const fieldName = useFragmentTypePolicyFieldName();
  const filterVarRef = useRef(makeVar<FragmentWhereFilter<FragmentType> | undefined>(filter));
  const limitVarRef = useRef(makeVar<number | undefined>(limit));
  const limitVar = limitVarRef.current;
  const filterVar = filterVarRef.current;
  const emptyValue = useRef<FragmentType[]>([]);

  useEffect(() => {
    if (typeof filter === 'function' && filter !== filterVar() || !equal(filter, filterVar())) {
      filterVar(filter);
    }
  }, [filter]);

  useEffect(() => {
    if (limit !== limitVar()) {
      limitVar(limit);
    }
  }, [limit]);

  const query = useOnce(() => buildWatchFragmentWhereQuery({
    filter,
    filterVar,
    limitVar,
    fragment,
    fieldName,
    cache,
    policies: cache.policies,
  }));

  const result = useGetQueryDataByFieldName<FragmentType[]>(query, fieldName, options);

  return {
    ...result,
    data: result.data ?? emptyValue.current,
  }
}

