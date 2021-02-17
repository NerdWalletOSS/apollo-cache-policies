import { FieldNode } from 'graphql';
import { Cache, Reference, StoreObject, StoreValue } from "@apollo/client/core";
import EntityTypeMap from "../entity-store/EntityTypeMap";
export interface FieldSpecifier {
  typename?: string;
  fieldName: string;
  field?: FieldNode;
  args?: Record<string, any>;
  variables?: Record<string, any>;
}

export interface ReadFieldOptions extends FieldSpecifier {
  from?: StoreObject | Reference;
}

export enum InvalidationPolicyEvent {
  Write = "Write",
  Evict = "Evict",
  Read = "Read",
}

export enum InvalidationPolicyLifecycleEvent {
  Write = "onWrite",
  Evict = "onEvict",
}

export enum RenewalPolicy {
  AccessOnly = "access-only",
  AccessAndWrite = "access-and-write",
  WriteOnly = "write-only",
  None = "none",
}

export interface InvalidationPolicies {
  timeToLive?: number;
  renewalPolicy?: RenewalPolicy;
  types?: {
    [typeName: string]: InvalidationPolicy;
  };
}

export type PolicyActionStorage = Record<string, Record<string, any>>;

export interface PolicyActionFields {
  id: string;
  ref: Reference;
  fieldName?: string;
  storeFieldName?: string;
  storage: PolicyActionStorage,
  variables?: Record<string, any>;
}

export type PolicyActionEntity = PolicyActionFields & PolicyActionMeta;

export interface PolicyActionMeta {
  parent: Omit<PolicyActionFields, 'storage'>;
}

export type PolicyAction = (
  cacheOperations: PolicyActionCacheOperations,
  entity: PolicyActionEntity
) => void;

export type DefaultPolicyAction = (
  cacheOperations: PolicyActionCacheOperations,
  entity: Pick<PolicyActionEntity, 'storage' | 'parent'>
) => void;

export type InvalidationPolicy = {
  [lifecycleEvent in InvalidationPolicyLifecycleEvent]?: {
    [typeName: string]: PolicyAction;
  } & {
    __default?: DefaultPolicyAction;
  };
} & {
  timeToLive?: number;
  renewalPolicy?: RenewalPolicy;
};

export type CacheOperations = {
  evict: (options: Cache.EvictOptions) => boolean;
  modify: (options: Cache.ModifyOptions) => boolean;
  readField: (
    fieldNameOrOptions?: string | ReadFieldOptions | undefined,
    from?: StoreObject | Reference
  ) => StoreValue | undefined;
};

export type PolicyActionCacheOperations = {
  evict: (options: Omit<Cache.EvictOptions, "broadcast">) => boolean;
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

export type InvalidationPolicyEventActivation = {
  [key in InvalidationPolicyEvent]: boolean;
};
