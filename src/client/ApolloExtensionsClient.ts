import {
  ApolloClient,
  ApolloClientOptions,
  ObservableQuery,
  OperationVariables,
} from '@apollo/client/core';
import { Policies } from '@apollo/client/cache/inmemory/policies';
import { buildWatchFragmentQuery, buildWatchFragmentWhereQuery } from './utils';
import { InvalidationPolicyCache } from '../cache';
import { WatchFragmentOptions, WatchFragmentWhereOptions } from './types';

export default class ApolloExtensionsClient<TCacheShape> extends ApolloClient<TCacheShape> {
  protected policies: Policies;

  constructor(config: ApolloClientOptions<TCacheShape>) {
    super(config);

    // @ts-ignore
    this.policies = this.cache.policies;
  }

  watchFragment<T = any, TVariables = OperationVariables>(
    options: WatchFragmentOptions,
  ): ObservableQuery<T, TVariables> {
    return this.watchQuery({
      fetchPolicy: 'cache-only',
      query: buildWatchFragmentQuery({
        ...options,
        policies: this.policies,
      }),
    });
  }

  watchFragmentWhere<FragmentType>(options: WatchFragmentWhereOptions<FragmentType>) {
    return this.watchQuery({
      fetchPolicy: 'cache-only',
      query: buildWatchFragmentWhereQuery({
        ...options,
        cache: this.cache as unknown as InvalidationPolicyCache,
        policies: this.policies,
      }),
    });
  }
}