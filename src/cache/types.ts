import { Cache, InMemoryCacheConfig } from "@apollo/client/core";
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
