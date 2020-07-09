import _ from "lodash";
import {
  InMemoryCache,
  Cache,
  NormalizedCacheObject,
  Reference,
  StoreObject,
  makeReference,
} from "@apollo/client";
import { ReadFieldOptions } from "@apollo/client/cache/core/types/common";
import { EntityStore } from "@apollo/client/cache/inmemory/entityStore";
import { fieldNameFromStoreName } from "@apollo/client/cache/inmemory/helpers";
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
  private entityTypeMap: EntityTypeMap;
  private invalidationPolicyManager: InvalidationPolicyManager;
  private cacheResultProcessor: CacheResultProcessor;
  private entityStoreRoot: EntityStore.Root;
  private isBroadcasting: boolean;

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

  private readField<T>(
    fieldNameOrOptions: string | ReadFieldOptions | undefined,
    from: StoreObject | Reference
  ) {
    if (!fieldNameOrOptions) {
      return;
    }

    return this.policies.readField<T>(
      typeof fieldNameOrOptions === "string"
        ? {
            fieldName: fieldNameOrOptions,
            from,
          }
        : fieldNameOrOptions,
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
  isOperatingonRootData() {
    // @ts-ignore
    return this.data === this.entityStoreRoot;
  }

  modify(options: Cache.ModifyOptions) {
    const modifyResult = super.modify(options);

    if (
      !this.invalidationPolicyManager.isPolicyActive(
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
      !this.invalidationPolicyManager.isPolicyActive(
        InvalidationPolicyEvent.Write
      ) ||
      !this.isOperatingonRootData()
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
      this.invalidationPolicyManager.isPolicyActive(
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

  read<T>(options: Cache.ReadOptions<any>): T | null {
    const result = super.read<T>(options);

    if (
      !this.invalidationPolicyManager.isPolicyActive(
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
    // Instead, diffs swill trigger the read policies for client-based reads like `readCache` invocations from watched queries outside
    // the scope of broadcasts.
    if (
      !this.invalidationPolicyManager.isPolicyActive(
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
      extractedCache.invalidation = _.pick(
        this.entityTypeMap.extract(),
        // The entitiesById are sufficient alone for reconstructing the type map, so to
        // minimize payload size only inject the entitiesById object into the extracted cache
        "entitiesById"
      );
    }

    return extractedCache;
  }
}
