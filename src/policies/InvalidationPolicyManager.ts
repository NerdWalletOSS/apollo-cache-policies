import _ from "lodash";
import {
  InvalidationPolicy,
  InvalidationPolicyActivation,
  InvalidationPolicyEvent,
  InvalidationPolicyLifecycleEvent,
  InvalidationPolicyManagerConfig,
  PolicyActionCacheOperations,
  PolicyActionMeta,
} from "./types";
import { makeEntityId } from "../helpers";
import { makeReference } from "@apollo/client";

/**
 * Executes invalidation policies for types when they are modified, evicted or read from the cache.
 */
export default class InvalidationPolicyManager {
  private mutedCacheOperations: PolicyActionCacheOperations;
  private policyActivation: InvalidationPolicyActivation;

  constructor(private config: InvalidationPolicyManagerConfig) {
    const {
      cacheOperations: { readField, evict, modify },
    } = this.config;

    // Watch broadcasts by evict and modify operations called by policy actions
    // are suppressed until after all policy actions have run.
    this.mutedCacheOperations = {
      readField,
      evict: (options) => evict({ ...options, broadcast: false }),
      modify: (options) => modify({ ...options, broadcast: false }),
    };

    this.policyActivation = this.activatePolicies();
  }

  private activatePolicies() {
    const { policies } = this.config;
    const { types: policyTypes = {}, timeToLive: defaultTimeToLive } = policies;

    return Object.keys(policyTypes).reduce<InvalidationPolicyActivation>(
      (acc, type) => {
        const policy = policyTypes[type];
        acc[InvalidationPolicyEvent.Read] =
          acc[InvalidationPolicyEvent.Read] || !!policy.timeToLive;
        acc[InvalidationPolicyEvent.Write] =
          acc[InvalidationPolicyEvent.Write] ||
          !!policy[InvalidationPolicyLifecycleEvent.Write];
        acc[InvalidationPolicyEvent.Evict] =
          acc[InvalidationPolicyEvent.Evict] ||
          !!policy[InvalidationPolicyLifecycleEvent.Evict];
        return acc;
      },
      {
        [InvalidationPolicyEvent.Read]: !!defaultTimeToLive,
        [InvalidationPolicyEvent.Write]: false,
        [InvalidationPolicyEvent.Evict]: false,
      }
    );
  }

  private getPolicy(typeName: string): InvalidationPolicy | null {
    return this.config.policies?.types?.[typeName] || null;
  }

  private getTypePolicyForEvent(
    typeName: string,
    policyEvent: InvalidationPolicyEvent.Evict | InvalidationPolicyEvent.Write
  ) {
    const policyForType = this.getPolicy(typeName);
    if (!policyForType) {
      return null;
    }
    return policyForType[InvalidationPolicyLifecycleEvent[policyEvent]];
  }

  private runPolicyEvent(
    typeName: string,
    policyEvent: InvalidationPolicyEvent.Evict | InvalidationPolicyEvent.Write,
    policyMeta: PolicyActionMeta
  ) {
    const { entityTypeMap } = this.config;
    const { mutedCacheOperations } = this;
    const typePolicyForEvent = this.getTypePolicyForEvent(
      typeName,
      policyEvent
    );
    if (!typePolicyForEvent) {
      return;
    }
    Object.keys(typePolicyForEvent).forEach((typeName: string) => {
      const typeMapEntities = entityTypeMap.readEntitiesByType(typeName) ?? {};
      const policyAction = typePolicyForEvent[typeName];

      Object.values(typeMapEntities).forEach((typeMapEntity) => {
        const { dataId, fieldName, storeFieldNames } = typeMapEntity;
        if (storeFieldNames) {
          Object.keys(storeFieldNames.entries).forEach((storeFieldName) => {
            policyAction(mutedCacheOperations, {
              id: dataId,
              fieldName,
              storeFieldName,
              variables: storeFieldNames.entries[storeFieldName].variables,
              ref: makeReference(dataId),
              ...policyMeta,
            });
          });
        } else {
          policyAction(mutedCacheOperations, {
            id: dataId,
            ref: makeReference(dataId),
            ...policyMeta,
          });
        }
      });
    });
  }

  runWritePolicy(typeName: string, policyMeta: PolicyActionMeta) {
    return this.runPolicyEvent(
      typeName,
      InvalidationPolicyEvent.Write,
      policyMeta
    );
  }

  runEvictPolicy(typeName: string, policyMeta: PolicyActionMeta) {
    return this.runPolicyEvent(
      typeName,
      InvalidationPolicyEvent.Evict,
      policyMeta
    );
  }

  runReadPolicy(
    typename: string,
    dataId: string,
    fieldName?: string,
    storeFieldName?: string
  ): boolean {
    const { cacheOperations, entityTypeMap, policies } = this.config;
    const entityId = makeEntityId(dataId, fieldName);
    const typeMapEntity = entityTypeMap.readEntityById(entityId);

    if (!typeMapEntity) {
      return true;
    }

    const entityCacheTime =
      storeFieldName && typeMapEntity.storeFieldNames
        ? typeMapEntity.storeFieldNames.entries[storeFieldName].cacheTime
        : typeMapEntity.cacheTime;
    const timeToLive =
      this.getPolicy(typename)?.timeToLive || policies.timeToLive;

    if (
      _.isNumber(entityCacheTime) &&
      timeToLive &&
      Date.now() > entityCacheTime + timeToLive
    ) {
      return cacheOperations.evict({
        id: dataId,
        fieldName: storeFieldName,
        broadcast: false,
      });
    }
    return false;
  }

  isPolicyActive(policyEvent: InvalidationPolicyEvent) {
    return this.policyActivation[policyEvent];
  }
}
