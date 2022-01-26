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

  // Watches the data in the cache similarly to watchQuery and additionally extracts the given fieldName from the watch query
  // subscription and returns a subscription that emits that field data.
  private watchQueryForField(query: DocumentNode, fieldName: string): ObservableQuery {
    const obsQuery = this.watchQuery({
      fetchPolicy: 'cache-only',
      query: query,
    });

    const subscribe = obsQuery.subscribe.bind(obsQuery);

    obsQuery.subscribe = (observer, ...rest) => {
      // This check is modeled after the Zen Observable observer check:
      // https://github.com/zenparsing/zen-observable/blob/master/src/Observable.js#L211
      if (typeof observer !== 'object') {
        observer = {
          next: observer,
          error: rest[0] as (error: any) => void,
          complete: rest[1] as () => void,
        };
      }

      const observerNext = observer.next;

      // The observer maps the value emitted from the observable to the data at the
      // given field name.
      observer.next = (value: Record<string, any>) => {
        if (observerNext) {
          observerNext(value?.data?.[fieldName]);
        }
      }

      const subscription = subscribe(observer);
      const unsubscribe = subscription.unsubscribe.bind(subscription);

      subscription.unsubscribe = () => {
        // @ts-ignore typePolicies is private. Delete the field name from the type policies
        // after the subscription has been cleaned up.
        delete this.cache.policies.typePolicies.Query.fields[fieldName];
        unsubscribe();
      }

      return subscription;
    }

    return obsQuery;
  }

  // Watches the data in the cache similarly to watchQuery for a given fragment.
  watchFragment(
    options: WatchFragmentOptions,
  ): ObservableQuery {
    const fieldName = generateFragmentFieldName();
    const query = buildWatchFragmentQuery({
      ...options,
      fieldName,
      policies: this.policies,
    });

    return this.watchQueryForField(query, fieldName);
  }

  // Watches the data in the cache similarly to watchQuery for all entities int he cache
  // matching the given filter.
  watchFragmentWhere<FragmentType>(options: WatchFragmentWhereOptions<FragmentType>) {
    const fieldName = generateFragmentFieldName();
    const query = buildWatchFragmentWhereQuery({
      ...options,
      fieldName,
      cache: this.cache as unknown as InvalidationPolicyCache,
      policies: this.policies,
    });

    return this.watchQueryForField(
      query,
      fieldName,
    );
  }
}
