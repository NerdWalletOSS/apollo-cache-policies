import {
  gql,
  InMemoryCache,
  Cache,
  NormalizedCacheObject,
  Reference,
  StoreObject,
  makeReference,
} from "@apollo/client/core";
import { compact, every, pick, isFunction } from "lodash-es";
import InvalidationPolicyManager from "../policies/InvalidationPolicyManager";
import { EntityStoreWatcher, EntityTypeMap } from "../entity-store";
import { makeEntityId, isQuery, maybeDeepClone, fieldNameFromStoreName } from "../helpers";
import { FragmentWhereFilter, InvalidationPolicyCacheConfig } from "./types";
import { CacheResultProcessor, ReadResultStatus } from "./CacheResultProcessor";
import { InvalidationPolicyEvent, ReadFieldOptions } from "../policies/types";
import { FragmentDefinitionNode } from 'graphql';
import { cacheExtensionsCollectionTypename, collectionEntityIdForType } from './utils';

/**
 * Extension of Apollo in-memory cache which adds support for cache policies.
 */

// @ts-ignore: Private API overloads
export default class InvalidationPolicyCache extends InMemoryCache {
  // @ts-ignore: Initialize in parent constructor
  protected entityTypeMap: EntityTypeMap;
  // @ts-ignore: Initialize in parent constructor
  protected entityStoreWatcher: EntityStoreWatcher;
  protected invalidationPolicyManager: InvalidationPolicyManager;
  protected cacheResultProcessor: CacheResultProcessor;
  protected entityStoreRoot: any;
  protected isBroadcasting: boolean;
  protected enableCollections: boolean;

  constructor(config: InvalidationPolicyCacheConfig = {}) {
    const { invalidationPolicies = {}, enableCollections = false, ...inMemoryCacheConfig } = config;
    super(inMemoryCacheConfig);

    this.enableCollections = enableCollections;
    this.isBroadcasting = false;

    const { entityTypeMap } = this;

    this.invalidationPolicyManager = new InvalidationPolicyManager({
      policies: invalidationPolicies,
      entityTypeMap: entityTypeMap,
      cacheOperations: {
        evict: (...args) => this.evict(...args),
        modify: (...args) => this.modify(...args),
        readField: (...args) => this.readField(...args),
      },
    });
    this.cacheResultProcessor = new CacheResultProcessor({
      invalidationPolicyManager: this.invalidationPolicyManager,
      // @ts-ignore This field is assigned in the parent constructor
      entityTypeMap: this.entityTypeMap,
      cache: this,
    });
  }

  // @ts-ignore private API
  private init() {
    // @ts-ignore private API
    super.init();

    // After init is called, the entity store has been reset so we must also reset
    // the cache policies library's corresponding entity type map, watcher and
    // cache result processor

    // @ts-ignore Data is a private API
    this.entityStoreRoot = this.data;
    this.entityTypeMap = new EntityTypeMap();
    this.entityStoreWatcher = new EntityStoreWatcher({
      entityStore: this.entityStoreRoot,
      entityTypeMap: this.entityTypeMap,
      policies: this.policies,
      updateCollectionField: this.updateCollectionField.bind(this),
    });
    this.cacheResultProcessor = new CacheResultProcessor({
      invalidationPolicyManager: this.invalidationPolicyManager,
      // @ts-ignore This field is assigned in the parent constructor
      entityTypeMap: this.entityTypeMap,
      cache: this,
    });
  }

  protected readField<T>(
    fieldNameOrOptions?: string | ReadFieldOptions,
    from?: StoreObject | Reference
  ) {
    if (!fieldNameOrOptions) {
      return;
    }

    const options = typeof fieldNameOrOptions === "string"
      ? {
        fieldName: fieldNameOrOptions,
        from,
      }
      : fieldNameOrOptions;

    if (void 0 === options.from) {
      options.from = { __ref: 'ROOT_QUERY' };
    }

    return this.policies.readField<T>(
      options,
      {
        store: this.entityStoreRoot,
      }
    );
  }

  protected broadcastWatches() {
    this.isBroadcasting = true;
    super.broadcastWatches();
    this.isBroadcasting = false;
  }

  // Determines whether the cache's data reference is set to the root store. If not, then there is an ongoing optimistic transaction
  // being applied to a new layer.
  isOperatingOnRootData() {
    // @ts-ignore
    return this.data === this.entityStoreRoot;
  }

  modify(options: Cache.ModifyOptions) {
    const modifyResult = super.modify(options);

    if (
      !this.invalidationPolicyManager.isPolicyEventActive(
        InvalidationPolicyEvent.Write
      ) ||
      !modifyResult
    ) {
      return modifyResult;
    }

    const { id = "ROOT_QUERY", fields } = options;

    if (isQuery(id)) {
      Object.keys(fields).forEach((storeFieldName) => {
        const fieldName = fieldNameFromStoreName(storeFieldName);

        const typename = this.entityTypeMap.readEntityById(
          makeEntityId(id, fieldName)
        )?.typename;

        if (!typename) {
          return;
        }

        this.invalidationPolicyManager.runWritePolicy(typename, {
          parent: {
            id,
            fieldName,
            storeFieldName,
            ref: makeReference(id),
          },
        });
      });
    } else {
      const typename = this.entityTypeMap.readEntityById(id)?.typename;

      if (!typename) {
        return modifyResult;
      }

      this.invalidationPolicyManager.runWritePolicy(typename, {
        parent: {
          id,
          ref: makeReference(id),
        },
      });
    }

    if (options.broadcast) {
      this.broadcastWatches();
    }

    return modifyResult;
  }

  write(options: Cache.WriteOptions<any, any>) {
    const writeResult = super.write(options);

    // Do not trigger a write policy if the current write is being applied to an optimistic data layer since
    // the policy will later be applied when the server data response is received.
    if (
      (!this.invalidationPolicyManager.isPolicyEventActive(
        InvalidationPolicyEvent.Write
      ) &&
        !this.invalidationPolicyManager.isPolicyEventActive(
          InvalidationPolicyEvent.Read
        )) ||
      !this.isOperatingOnRootData()
    ) {
      return writeResult;
    }

    this.cacheResultProcessor.processWriteResult(options);

    if (options.broadcast) {
      this.broadcastWatches();
    }

    return writeResult;
  }

  // Evicts all entities of the given type matching the filter criteria. Returns a list of evicted entities
  // by reference.
  evictWhere<EntityType>(filters: { __typename: string, filter?: FragmentWhereFilter<EntityType> }) {
    const { __typename, filter } = filters;

    const references = this.readReferenceWhere({
      __typename,
      filter,
    });

    references.forEach((ref) => this.evict({ id: ref.__ref, broadcast: false }));
    this.broadcastWatches();

    return references;
  }

  evict(options: Cache.EvictOptions): boolean {
    const { fieldName, args } = options;
    let { id } = options;
    if (!id) {
      if (Object.prototype.hasOwnProperty.call(options, "id")) {
        return false;
      }
      id = "ROOT_QUERY";
    }

    if (
      this.invalidationPolicyManager.isPolicyEventActive(
        InvalidationPolicyEvent.Evict
      )
    ) {
      const { typename } =
        this.entityTypeMap.readEntityById(makeEntityId(id, fieldName)) ?? {};

      if (typename) {
        const storeFieldName =
          isQuery(id) && fieldName
            ? this.policies.getStoreFieldName({
              typename,
              fieldName,
              args,
            })
            : undefined;

        this.invalidationPolicyManager.runEvictPolicy(typename, {
          parent: {
            id,
            fieldName,
            storeFieldName,
            variables: args,
            ref: makeReference(id),
          },
        });
      }
    }

    return super.evict(options);
  }

  protected updateCollectionField(typename: string, dataId: string) {
    // Since colletion support is still experimental, only record entities in collections if enabled
    if (!this.enableCollections) {
      return;
    }

    const collectionEntityId = collectionEntityIdForType(typename);
    const collectionFieldExists = !!this.readField<Record<string, any[]>>('id', makeReference(collectionEntityId));

    // If the collection field for the type does not exist in the cache, then initialize it as
    // an empty array.
    if (!collectionFieldExists) {
      this.writeFragment({
        id: collectionEntityId,
        fragment: gql`
          fragment InitializeCollectionEntity on CacheExtensionsCollectionEntity {
            data
            id
          }
        `,
        data: {
          __typename: cacheExtensionsCollectionTypename,
          id: typename,
          data: [],
        },
      });
    }

    // If the entity does not already exist in the cache, add it to the collection field policy for its type
    if (!this.entityTypeMap.readEntityById(dataId)) {
      this.modify({
        broadcast: false,
        id: collectionEntityId,
        fields: {
          data: (existing, { canRead }) => {
            return [
              ...existing.filter((ref: Reference) => canRead(ref)),
              makeReference(dataId),
            ];
          }
        }
      });
    }
  }

  // Returns all expired entities whose cache time exceeds their type's timeToLive or as a fallback
  // the global timeToLive if specified. Evicts the expired entities by default, with an option to only report
  // them.
  private _expire(reportOnly = false) {
    const { entitiesById } = this.entityTypeMap.extract();
    const expiredEntityIds: string[] = [];

    Object.keys(entitiesById).forEach((entityId) => {
      const entity = entitiesById[entityId];
      const { storeFieldNames, dataId, fieldName, typename } = entity;

      if (isQuery(dataId) && storeFieldNames) {
        Object.keys(storeFieldNames.entries).forEach((storeFieldName) => {
          const isExpired = this.invalidationPolicyManager.runReadPolicy({
            typename,
            dataId,
            fieldName,
            storeFieldName,
            reportOnly,
          });
          if (isExpired) {
            expiredEntityIds.push(makeEntityId(dataId, storeFieldName));
          }
        });
      } else {
        const isExpired = this.invalidationPolicyManager.runReadPolicy({
          typename,
          dataId,
          fieldName,
          reportOnly,
        });
        if (isExpired) {
          expiredEntityIds.push(makeEntityId(dataId));
        }
      }
    });

    if (expiredEntityIds.length > 0) {
      this.broadcastWatches();
    }

    return expiredEntityIds;
  }

  // Expires all entities still present in the cache that have exceeded their timeToLive. By default entities are evicted
  // lazily on read if their entity is expired. Use this expire API to eagerly remove expired entities.
  expire() {
    return this._expire(false);
  }

  // Returns all expired entities still present in the cache.
  expiredEntities() {
    return this._expire(true);
  }

  // Activates the provided policy events (on read, on write, on evict) or by default all policy events.
  activatePolicyEvents(...policyEvents: InvalidationPolicyEvent[]) {
    if (policyEvents.length > 0) {
      this.invalidationPolicyManager.activatePolicies(...policyEvents);
    } else {
      this.invalidationPolicyManager.activatePolicies(
        InvalidationPolicyEvent.Read,
        InvalidationPolicyEvent.Write,
        InvalidationPolicyEvent.Evict
      );
    }
  }

  // Deactivates the provided policy events (on read, on write, on evict) or by default all policy events.
  deactivatePolicyEvents(...policyEvents: InvalidationPolicyEvent[]) {
    if (policyEvents.length > 0) {
      this.invalidationPolicyManager.deactivatePolicies(...policyEvents);
    } else {
      this.invalidationPolicyManager.deactivatePolicies(
        InvalidationPolicyEvent.Read,
        InvalidationPolicyEvent.Write,
        InvalidationPolicyEvent.Evict
      );
    }
  }

  // Returns the policy events that are currently active.
  activePolicyEvents() {
    return [
      InvalidationPolicyEvent.Read,
      InvalidationPolicyEvent.Write,
      InvalidationPolicyEvent.Evict
    ].filter(policyEvent => this.invalidationPolicyManager.isPolicyEventActive(policyEvent));
  }

  read<T>(options: Cache.ReadOptions<any>): T | null {
    const result = super.read<T>(options);

    if (
      !this.invalidationPolicyManager.isPolicyEventActive(
        InvalidationPolicyEvent.Read
      )
    ) {
      return result;
    }

    const processedResult = maybeDeepClone(result);
    const processedResultStatus = this.cacheResultProcessor.processReadResult(
      processedResult,
      options
    );

    if (processedResultStatus === ReadResultStatus.Complete) {
      return result;
    }

    this.broadcastWatches();

    return processedResultStatus === ReadResultStatus.Evicted
      ? null
      : processedResult;
  }

  diff<T>(options: Cache.DiffOptions): Cache.DiffResult<T> {
    const cacheDiff = super.diff<T>(options);

    // Diff calls made by `broadcastWatches` should not trigger the read policy
    // as these are internal reads not reflective of client action and can lead to recursive recomputation of cached data which is an error.
    // Instead, diffs will trigger the read policies for client-based reads like `readCache` invocations from watched queries outside
    // the scope of broadcasts.
    if (
      !this.invalidationPolicyManager.isPolicyEventActive(
        InvalidationPolicyEvent.Read
      ) ||
      this.isBroadcasting
    ) {
      return cacheDiff;
    }

    const { result } = cacheDiff;

    const processedResult = maybeDeepClone(result);
    const processedResultStatus = this.cacheResultProcessor.processReadResult(
      processedResult,
      options
    );

    if (processedResultStatus === ReadResultStatus.Complete) {
      return cacheDiff;
    }

    this.broadcastWatches();

    cacheDiff.complete = false;
    cacheDiff.result =
      processedResultStatus === ReadResultStatus.Evicted
        ? undefined
        : processedResult;

    return cacheDiff;
  }

  extract(optimistic = false, withInvalidation = true): NormalizedCacheObject {
    const extractedCache = super.extract(optimistic);

    if (withInvalidation) {
      // The entitiesById are sufficient alone for reconstructing the type map, so to
      // minimize payload size only inject the entitiesById object into the extracted cache
      extractedCache.invalidation = pick(
        this.entityTypeMap.extract(),
        "entitiesById"
      );
    }

    return extractedCache;
  }

  // Supports reading a collection of entities by type from the cache and filtering them by the given fields. Returns
  // a list of the dereferenced matching entities from the cache based on the given fragment.
  readFragmentWhere<FragmentType, TVariables = any>(options: Cache.ReadFragmentOptions<FragmentType, TVariables> & {
    filter?: FragmentWhereFilter<FragmentType>;
  }): FragmentType[] {
    const { fragment, filter, ...restOptions } = options;
    const fragmentDefinition = fragment.definitions[0] as FragmentDefinitionNode;
    const __typename = fragmentDefinition.typeCondition.name.value;

    const matchingRefs = this.readReferenceWhere(
      {
        __typename,
        filter
      }
    );

    const matchingFragments = matchingRefs.map(ref => this.readFragment({
      ...restOptions,
      fragment,
      id: ref.__ref,
    }));

    return compact(matchingFragments);
  }

  // Supports reading a collection of references by type from the cache and filtering them by the given fields. Returns a
  // list of the matching references.
  readReferenceWhere<T>(options: {
    __typename: string,
    filter?: FragmentWhereFilter<T>;
  }) {
    const { __typename, filter } = options;
    const collectionEntityName = collectionEntityIdForType(__typename);
    const entityReferences = this.readField<Reference[]>('data', makeReference(collectionEntityName));

    if (!entityReferences) {
      return [];
    }

    if (!filter) {
      return entityReferences;
    }

    return entityReferences.filter(ref => {
      if (isFunction(filter)) {
        return filter(ref, this.readField.bind(this));
      }

      const entityFilterResults = Object.keys(filter).map(filterField => {
        // @ts-ignore
        const filterValue = filter[filterField];
        const entityValueForFilter = this.readField(filterField, ref);

        return filterValue === entityValueForFilter;
      });

      return every(entityFilterResults, Boolean);
    });
  }
}
