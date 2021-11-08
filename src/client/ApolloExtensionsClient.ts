import {
  ApolloClient,
  ApolloClientOptions,
  DocumentNode,
  ObservableQuery,
} from '@apollo/client/core';
import { Policies } from '@apollo/client/cache/inmemory/policies';
import { buildWatchFragmentQuery, buildWatchFragmentWhereQuery } from './utils';
import { InvalidationPolicyCache } from '../cache';
import { WatchFragmentOptions, WatchFragmentWhereOptions } from './types';
import { generateFragmentFieldName } from '../helpers';

// An extension of the Apollo client that add support for watching updates to entities
// and collections of entities based on the provided filters.
export default class ApolloExtensionsClient<TCacheShape> extends ApolloClient<TCacheShape> {
  protected policies: Policies;

  constructor(config: ApolloClientOptions<TCacheShape>) {
    super(config);

    // @ts-ignore
    this.policies = this.cache.policies;
  }

  // A proxy to the watchQuery API used by the watch fragment APIs to
  // extract the data result from the watchQuery subscription's dynamically
  // created field name.
  private proxyWatchQuery(query: DocumentNode, fieldName: string): ObservableQuery {
    const obsQuery = this.watchQuery({
      fetchPolicy: 'cache-only',
      query: query,
    });

    const subscribe = obsQuery.subscribe.bind(obsQuery);

    obsQuery.subscribe = (observer) => {
      // This check is modeled after the Zen Observable observer check:
      // https://github.com/zenparsing/zen-observable/blob/master/src/Observable.js#L211
      if (typeof observer != 'object') {
        observer = {
          next: observer,
          error: arguments[1],
          complete: arguments[2],
        };
      }

      if (!observer.next) {
        return subscribe(observer);
      }

      const observerNext = observer.next;

      observer.next = (value: Record<string, any>) => {
        observerNext(value?.data?.[fieldName]);
      }

      return subscribe(observer);
    }

    return obsQuery;
  }

  watchFragment(
    options: WatchFragmentOptions,
  ): ObservableQuery {
    const fieldName = generateFragmentFieldName();
    const query = buildWatchFragmentQuery({
      ...options,
      fieldName,
      policies: this.policies,
    });

    return this.proxyWatchQuery(query, fieldName);
  }

  watchFragmentWhere<FragmentType>(options: WatchFragmentWhereOptions<FragmentType>) {
    const fieldName = generateFragmentFieldName();
    const query = buildWatchFragmentWhereQuery({
      ...options,
      fieldName,
      cache: this.cache as unknown as InvalidationPolicyCache,
      policies: this.policies,
    });

    return this.proxyWatchQuery(
      query,
      fieldName,
    );
  }
}