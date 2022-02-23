import { gql, makeVar, ReactiveVar } from "@apollo/client";
import { InvalidationPolicyCache } from ".";

var rvCache!: ReactiveVarsCache;

export const cachedReactiveVarTypename = 'CachedReactiveVar';

export function initReactiveVarsCache(cache: InvalidationPolicyCache): ReactiveVarsCache {
  rvCache = new ReactiveVarsCache({
    cache,
  });
  return rvCache;
}

const cachedReactiveVarFragment = gql`
  fragment ReadCachedReactiveVarFragment on CachedReactiveVar {
    id
    value
  }
`

export function makeCachedVar<T>(id: string, value: T): ReactiveVar<T> {
  return rvCache.registerCachedVar<T>(id, value);
}

interface ReactiveVarsCacheConfig {
  cache: InvalidationPolicyCache;
}

export class ReactiveVarsCache {
  registeredVars: Record<string, {
    rv: ReactiveVar<any>;
    defaultValue: any;
  }> = {};
  cache!: InvalidationPolicyCache;

  constructor({ cache }: ReactiveVarsCacheConfig) {
    this.cache = cache;
  }

  private watchReactiveVar<T>(id: string, rv: ReactiveVar<T>) {
    rv.onNextChange((value) => {
      this.writeCachedVar(id, value)
      // Reactive variables support an `onNextChange` API that allows listeners
      // to subscribe to the next value change. This only applies to a single change,
      // so to subscribe to every change, a new listener must be added after processing
      // the current change.
      this.watchReactiveVar<T>(id, rv);
    });
  }

  registerCachedVar<T>(id: string, defaultValue: T): ReactiveVar<T> {
    const cachedValue = this.readCachedVar<T>(id);
    const rv = makeVar<T>(cachedValue ?? defaultValue);

    if (this.registeredVars[id]) {
      console.warn(`Duplicate cached reactive variable with ID ${id} detected. Multiple cached reactive variables should not share the same ID.`);
    }

    this.registeredVars[id] = {
      rv,
      defaultValue,
    }

    // If the cache did not already had a value for the CachedReactiveVar with this ID,
    // then it should be seeded with one using the provided default value.
    if (!cachedValue) {
      this.writeCachedVar(id, defaultValue);
    }

    this.watchReactiveVar(id, rv);
    return rv;
  }

  readCachedVar<T>(id: string): T | null {
    const entityId = this.cache.identify({
      __typename: cachedReactiveVarTypename,
      id,
    });

    const cachedData = this.cache.readFragment<{ value: T | null }>({
      fragment: cachedReactiveVarFragment,
      id: entityId,
    });
    return cachedData?.value ?? null;
  }

  writeCachedVar<T>(id: string, value: T) {
    this.cache.writeFragment({
      id: rvCache.cache.identify({
        __typename: cachedReactiveVarTypename,
        id,
      }),
      fragment: cachedReactiveVarFragment,
      data: {
        __typename: cachedReactiveVarTypename,
        id,
        value,
      }
    });
  }

  // Notifies all reactive variables that the cache has changed
  // and that they need to be reset to the cache's current value.
  reset() {
    Object.keys(this.registeredVars).forEach((id) => {
      const { rv, defaultValue } = this.registeredVars[id];
      // If the registered reactive variable does not exist in the cache anymore,
      // such as after resetStore() has been called on the cache, then the reactive
      // variable should be reset to its original value.
      rv(this.readCachedVar(id) ?? defaultValue);
    });
  }
}
