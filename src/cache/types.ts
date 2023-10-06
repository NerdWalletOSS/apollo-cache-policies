import { Cache, InMemoryCacheConfig, Reference } from "@apollo/client/core";
import { InvalidationPolicies, PolicyActionMeta } from "../policies/types";
import { EntityTypeMap } from "../entity-store";
import InvalidationPolicyManager from "../policies/InvalidationPolicyManager";
import { InvalidationPolicyCache } from ".";

export interface InvalidationPolicyCacheConfig extends InMemoryCacheConfig {
  invalidationPolicies?: InvalidationPolicies;
  enableCollections?: boolean;
}

export interface InvalidationPolicyCacheEvictOptions
  extends Cache.EvictOptions {
  meta?: PolicyActionMeta;
}

export interface CacheResultProcessorConfig {
  entityTypeMap: EntityTypeMap;
  invalidationPolicyManager: InvalidationPolicyManager;
  cache: InvalidationPolicyCache;
}

export type FragmentWhereFilter<T> = Partial<Record<keyof T, any>> | ((__ref: Reference, readField: InvalidationPolicyCache['readField']) => boolean);

export type FragmentWhereOrderBy = { field: string; descending: boolean };