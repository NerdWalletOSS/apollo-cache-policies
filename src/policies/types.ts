import { Cache, Reference, StoreObject, StoreValue } from "@apollo/client";
import { ReadFieldOptions } from "@apollo/client/cache/core/types/common";
import EntityTypeMap from "../entity-store/EntityTypeMap";

export enum InvalidationPolicyEvent {
  Write = "Write",
  Evict = "Evict",
  Read = "Read",
}

export enum InvalidationPolicyLifecycleEvent {
  Write = "onWrite",
  Evict = "onEvict",
}

export interface InvalidationPolicies {
  timeToLive?: number;
  types?: {
    [typeName: string]: InvalidationPolicy;
  };
}

export interface PolicyActionFields {
  id: string;
  ref: Reference;
  fieldName?: string;
  storeFieldName?: string;
  variables?: Record<string, any>;
}

export type PolicyActionEntity = PolicyActionFields & PolicyActionMeta;

export interface PolicyActionMeta {
  parent: PolicyActionFields;
}

export type PolicyAction = (
  cacheOperations: PolicyActionCacheOperations,
  entity: PolicyActionEntity
) => void;

export type InvalidationPolicy = {
  [lifecycleEvent in InvalidationPolicyLifecycleEvent]?: {
    [typeName: string]: PolicyAction;
  };
} & {
  timeToLive?: number;
};

export type CacheOperations = {
  evict: (
    options: Cache.EvictOptions,
    fieldName?: string,
    args?: Record<string, any>
  ) => boolean;
  modify: (options: Cache.ModifyOptions) => boolean;
  readField: (
    fieldNameOrOptions?: string | ReadFieldOptions | undefined,
    from?: StoreObject | Reference
  ) => StoreValue | undefined;
};

export type PolicyActionCacheOperations = {
  evict: (
    options: Omit<Cache.EvictOptions, "broadcast">,
    fieldName?: string,
    args?: Record<string, any>
  ) => boolean;
  modify: (options: Omit<Cache.ModifyOptions, "broadcast">) => boolean;
  readField: (
    fieldNameOrOptions?: string | ReadFieldOptions | undefined,
    from?: StoreObject | Reference
  ) => StoreValue | undefined;
};

export interface InvalidationPolicyManagerConfig {
  policies: InvalidationPolicies;
  cacheOperations: CacheOperations;
  entityTypeMap: EntityTypeMap;
}

export type InvalidationPolicyActivation = {
  [key in InvalidationPolicyEvent]: boolean;
};
