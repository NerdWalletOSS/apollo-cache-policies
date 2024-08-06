import { StoreObject } from "@apollo/client/core";
import EntityTypeMap from "./EntityTypeMap";
import { NormalizedCacheObjectWithInvalidation } from "./types";
import { makeEntityId, isQuery } from "../helpers";
import { Policies } from '@apollo/client/cache/inmemory/policies';
import { cacheExtensionsCollectionTypename } from '../cache/utils';
import { ReactiveVarsCache } from "../cache/ReactiveVarsCache";

interface EntityStoreWatcherConfig {
  entityStore: any;
  entityTypeMap: EntityTypeMap;
  policies: Policies;
  reactiveVarsCache: ReactiveVarsCache;
  updateCollectionField: (typename: string, dataId: string) => void;
}

type EntityStoreWatcherStoreFunctions = {
  clear: any;
  delete: any;
  merge: any;
  replace: any;
};

/**
 * Watches the EntityStore for changes and performs side-effects to keep the EntityTypeMap synchronized with the data in the EntityStore.
 */
export default class EntityStoreWatcher {
  private storeFunctions: EntityStoreWatcherStoreFunctions;

  constructor(private config: EntityStoreWatcherConfig) {
    const {
      entityStore: { clear, delete: deleteKey, merge, replace },
    } = this.config;

    this.storeFunctions = {
      clear,
      delete: deleteKey,
      merge,
      replace,
    };
    this.watch();
  }

  private delete = (
    dataId: string,
    fieldName?: string,
    args?: Record<string, any>
  ) => {
    const { entityStore, entityTypeMap, policies } = this.config;

    const result = this.storeFunctions.delete.call(
      entityStore,
      dataId,
      fieldName,
      args
    );
    const entity = entityTypeMap.readEntityById(
      makeEntityId(dataId, fieldName)
    );
    const storeFieldName =
      fieldName && args
        ? policies.getStoreFieldName({
          typename: entity ? entity.typename : undefined,
          fieldName,
          args,
        })
        : undefined;
    entityTypeMap.evict(dataId, storeFieldName || fieldName);

    return result;
  };

  private merge = (dataId: string, incomingStoreObject: StoreObject) => {
    const { entityStore, entityTypeMap } = this.config;

    if (isQuery(dataId)) {
      Object.keys(incomingStoreObject)
        .filter(
          (storeFieldName) =>
            // If there is a valid response, it will contain the type Query and then the nested response types for each requested field. We want
            // to record a map of the types for those fields to their field store names. If there is no incoming data it is because that cache entry for storeFieldName
            // is being deleted so do nothing
            storeFieldName !== "__typename"
        )
        .forEach((storeFieldName) => {
          const entityStoreObject = incomingStoreObject[
            storeFieldName
          ] as StoreObject;
          const typename = entityStoreObject?.__typename;

          if (typename) {
            entityTypeMap.write(
              typename,
              dataId,
              storeFieldName
            );
          } else {
            const queryTypename = this.config.policies.rootTypenamesById[dataId];
            entityTypeMap.write(queryTypename, dataId, storeFieldName);
          }
        });
    } else {
      const typename = incomingStoreObject.__typename;
      // If the incoming data is empty, the dataId entry in the cache is being deleted so do nothing
      if (dataId && typename && typename !== cacheExtensionsCollectionTypename) {
        this.config.updateCollectionField(typename, dataId);
        entityTypeMap.write(typename, dataId);
      }
    }
    return this.storeFunctions.merge.call(
      entityStore,
      dataId,
      incomingStoreObject
    );
  };

  private clear = () => {
    const {
      config: { entityStore, entityTypeMap },
      storeFunctions,
    } = this;
    entityTypeMap.clear();
    storeFunctions.clear.call(entityStore);
  };

  private replace = (data: NormalizedCacheObjectWithInvalidation | null) => {
    const {
      config: { entityStore, entityTypeMap, reactiveVarsCache, },
      storeFunctions: { replace },
    } = this;

    const invalidation = data?.invalidation;

    if (!data || !invalidation) {
      replace.call(entityStore, data);
      // After the EntityStore has been replaced, the ReactiveVarsCache should be reset to update
      // reactive vars with the new cached values.
      reactiveVarsCache.reset();
      return;
    }

    delete data.invalidation;
    entityTypeMap.restore(invalidation.entitiesById);
    // The entity type map has already been restored and the store watcher
    // does not need to run for the merges triggered by replacing the entity store.
    // Those writes would also clobber any TTLs in the entity type map from the replaced data
    // so instead we pause the store watcher until the entity store data has been replaced.
    this.pause();
    replace.call(entityStore, data);
    reactiveVarsCache.reset();
    this.watch();
  };

  private watch() {
    const { entityStore } = this.config;

    entityStore.clear = this.clear;
    entityStore.delete = this.delete;
    entityStore.merge = this.merge;
    entityStore.replace = this.replace;
  }

  private pause() {
    const { entityStore } = this.config;
    const {
      clear,
      delete: deleteFunction,
      merge,
      replace,
    } = this.storeFunctions;

    entityStore.clear = clear;
    entityStore.delete = deleteFunction;
    entityStore.merge = merge;
    entityStore.replace = replace;
  }
}
