import _ from "lodash";
import {
  InMemoryCache,
  Cache,
  NormalizedCacheObject,
  Reference,
  StoreObject,
  makeReference,
} from "@apollo/client";
import {
  EntityStore,
  ReadFieldOptions,
  fieldNameFromStoreName,
} from "@apollo/client/cache";
import InvalidationPolicyManager from "../policies/InvalidationPolicyManager";
import { EntityStoreWatcher, EntityTypeMap } from "../entity-store";
import { makeEntityId, isQuery, maybeDeepClone } from "../helpers";
import { InvalidationPolicyCacheConfig } from "./types";
import { CacheResultProcessor, ReadResultStatus } from "./CacheResultProcessor";
import { InvalidationPolicyEvent } from "../policies/types";

/**
 * Extension of Apollo in-memory cache which adds support for invalidation policies.
 */
export default class InvalidationPolicyCache extends InMemoryCache {
  protected entityTypeMap: EntityTypeMap;
  protected invalidationPolicyManager: InvalidationPolicyManager;
  protected cacheResultProcessor: CacheResultProcessor;
  protected entityStoreRoot: EntityStore.Root;
  protected isBroadcasting: boolean;

  constructor(config: InvalidationPolicyCacheConfig = {}) {
    const { invalidationPolicies = {}, ...inMemoryCacheConfig } = config;
    super(inMemoryCacheConfig);

    // @ts-ignore
    this.entityStoreRoot = this.data;
    this.isBroadcasting = false;
    this.entityTypeMap = new EntityTypeMap();
    new EntityStoreWatcher({
      entityStore: this.entityStoreRoot,
      entityTypeMap: this.entityTypeMap,
      policies: this.policies,
    });
    this.invalidationPolicyManager = new InvalidationPolicyManager({
      policies: invalidationPolicies,
      entityTypeMap: this.entityTypeMap,
      cacheOperations: {
        evict: this.evict.bind(this),
        modify: this.modify.bind(this),
        readField: this.readField.bind(this),
      },
    });
    this.cacheResultProcessor = new CacheResultProcessor({
      invalidationPolicyManager: this.invalidationPolicyManager,
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

    const options =
      typeof fieldNameOrOptions === "string"
        ? {
            fieldName: fieldNameOrOptions,
            from,
          }
        : fieldNameOrOptions;

    if (void 0 === options.from) {
      options.from = { __ref: "ROOT_QUERY" };
    }

    return this.policies.readField<T>(options, {
      store: this.entityStoreRoot,
    });
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
      InvalidationPolicyEvent.Evict,
    ].filter((policyEvent) =>
      this.invalidationPolicyManager.isPolicyEventActive(policyEvent)
    );
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
      extractedCache.invalidation = _.pick(
        this.entityTypeMap.extract(),
        "entitiesById"
      );
    }

    return extractedCache;
  }
}
