import { getApolloContext } from '@apollo/client';
import { useContext } from 'react';
import { useOnce } from './utils';
import InvalidationPolicyCache from '../cache/InvalidationPolicyCache';
import { DocumentNode } from 'graphql';
import { buildWatchFragmentQuery } from '../client/utils';
import { useFragmentTypePolicyFieldName } from './useFragmentTypePolicyFieldName';
import { useGetQueryDataByFieldName } from './useGetQueryDataByFieldName';

interface UseFragmentOptions {
  id: string;
}

export default function useFragment<FragmentType>(fragment: DocumentNode, options: UseFragmentOptions) {
  const context = useContext(getApolloContext());
  const client = context.client;
  const cache = client?.cache as unknown as InvalidationPolicyCache;
  const fieldName = useFragmentTypePolicyFieldName();

  const queryForFragment = useOnce(() => buildWatchFragmentQuery({
    fragment,
    fieldName,
    id: options.id,
    policies: cache.policies,
  }));

  return useGetQueryDataByFieldName<FragmentType | null>(queryForFragment, fieldName);
}
