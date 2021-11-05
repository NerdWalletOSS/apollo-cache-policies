import {
  ApolloClient,
  ApolloClientOptions,
  DocumentNode,
  ObservableQuery,
} from '@apollo/client/core';
import { uuid } from 'uuidv4';
import { Policies } from '@apollo/client/cache/inmemory/policies';
import { buildWatchFragmentQuery, buildWatchFragmentWhereQuery } from './utils';
import { InvalidationPolicyCache } from '../cache';
import { WatchFragmentOptions, WatchFragmentWhereOptions } from './types';

// An extension of the Apollo client that add support for watching updates to entities
// and collections of entities based on the provided filters.
export default class ApolloExtensionsClient<TCacheShape> extends ApolloClient<TCacheShape> {
  protected policies: Policies;

  constructor(config: ApolloClientOptions<TCacheShape>) {
    super(config);

    // @ts-ignore
    this.policies = this.cache.policies;
  }

  // A proxy to the watchQuery API used by the watchFragment APIs to
  // extract the data result from the watchQuery subscription's artificially
  // created field name.
  private proxyWatchQuery(query: DocumentNode, fieldName: string): ObservableQuery {
    const obsQuery = this.watchQuery({
      fetchPolicy: 'cache-only',
      query: query,
    });

    const subscribe = obsQuery.subscribe;

    obsQuery.subscribe = (observer) => {
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
        observerNext(value?.[fieldName]);
      }

      return subscribe(observer);
    }

    return obsQuery;
  }

  watchFragment(
    options: WatchFragmentOptions,
  ): ObservableQuery {
    const fieldName = uuid();
    const query = buildWatchFragmentQuery({
      ...options,
      fieldName,
      policies: this.policies,
    });

    return this.proxyWatchQuery(query, fieldName);
  }

  watchFragmentWhere<FragmentType>(options: WatchFragmentWhereOptions<FragmentType>) {
    const fieldName = uuid();
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