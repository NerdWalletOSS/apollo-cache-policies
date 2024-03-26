import { getApolloContext } from '@apollo/client';
import { useContext, useEffect, useMemo, useRef } from 'react';
import { DocumentNode } from 'graphql';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { buildWatchFragmentWhereQuery } from '../client/utils';
import { FragmentWhereFilter, FragmentWhereOrderBy } from '../cache/types';
import { useFragmentTypePolicyFieldName } from './useFragmentTypePolicyFieldName';
import { useGetQueryDataByFieldName } from './useGetQueryDataByFieldName';
import { makeVar } from '@apollo/client';
import { equal } from '@wry/equality';

// A hook for subscribing to a fragment for entities in the Apollo cache matching a given filter from a React component.
export default function useFragmentWhere<FragmentType>(fragment: DocumentNode, options?: {
  filter?: FragmentWhereFilter<FragmentType>;
  returnPartialData?: boolean;
  limit?: number;
  orderBy?: FragmentWhereOrderBy;
  fragmentName?: string;
}) {
  const filter = options?.filter;
  const filterVarRef = useRef(makeVar<FragmentWhereFilter<FragmentType> | undefined>(filter));
  const filterVar = filterVarRef.current;

  const limit = options?.limit;
  const limitVarRef = useRef(makeVar<number | undefined>(limit));
  const limitVar = limitVarRef.current;

  const orderBy = options?.orderBy;
  const orderByVarRef = useRef(makeVar<FragmentWhereOrderBy | undefined>(orderBy));
  const orderByVar = orderByVarRef.current;

  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;
  const fieldName = useFragmentTypePolicyFieldName({
    fragmentName: options?.fragmentName,
  });
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

  useEffect(() => {
    if (typeof orderBy === 'function' && orderBy !== orderByVar() || !equal(orderBy, orderByVar())) {
      orderByVar(orderBy);
    }
  }, [orderBy]);

  const query = useMemo(() => buildWatchFragmentWhereQuery({
    filter,
    filterVar,
    limitVar,
    orderByVar,
    fragment,
    fieldName,
    cache,
    policies: cache.policies,
  }), [fieldName]);

  const result = useGetQueryDataByFieldName<FragmentType[]>(query, fieldName, options);

  return {
    ...result,
    data: result.data ?? emptyValue.current,
  }
}

