import _ from "lodash";
import {
  InvalidationPolicy,
  InvalidationPolicyEventActivation,
  InvalidationPolicyEvent,
  InvalidationPolicyLifecycleEvent,
  InvalidationPolicyManagerConfig,
  PolicyActionCacheOperations,
  PolicyActionMeta,
  PolicyActionStorage,
} from "./types";
import { makeEntityId } from "../helpers";
import { makeReference } from "@apollo/client/core";
import { RenewalPolicy } from "./types";

/**
 * Executes cache policies for types when they are modified, evicted or read from the cache.
 */
export default class InvalidationPolicyManager {
  private mutedCacheOperations: PolicyActionCacheOperations;
  private activePolicyEvents: InvalidationPolicyEventActivation;
  private policyActionStorage: PolicyActionStorage = {};

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

    this.activePolicyEvents = this.activateInitialPolicyEvents();
  }

  private activateInitialPolicyEvents() {
    const { policies } = this.config;
    const { types: policyTypes = {}, timeToLive: defaultTimeToLive } = policies;

    return Object.keys(policyTypes).reduce<InvalidationPolicyEventActivation>(
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

  private getPolicyActionStorage(identifier: string): Record<string, any> {
    const existingStorage = this.policyActionStorage[identifier];

    if (!existingStorage) {
      this.policyActionStorage[identifier] = {};
    }

    return this.policyActionStorage[identifier];
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

    const { __default: defaultPolicyAction, ...restTypePolicyTypeNames } = typePolicyForEvent;

    if (defaultPolicyAction) {
      defaultPolicyAction(mutedCacheOperations, {
        storage: this.getPolicyActionStorage(`${typeName}__default`),
        ...policyMeta,
      });
    }

    Object.keys(restTypePolicyTypeNames).forEach((typePolicyTypeName: string) => {
      const typeMapEntities = entityTypeMap.readEntitiesByType(typePolicyTypeName) ?? {};
      const policyAction = typePolicyForEvent[typePolicyTypeName];

      Object.values(typeMapEntities).forEach((typeMapEntity) => {
        const { dataId, fieldName, storeFieldNames } = typeMapEntity;
        if (storeFieldNames) {
          Object.keys(storeFieldNames.entries).forEach((storeFieldName) => {
            policyAction(mutedCacheOperations, {
              id: dataId,
              fieldName,
              storeFieldName,
              variables: storeFieldNames.entries[storeFieldName].variables,
              args: storeFieldNames.entries[storeFieldName].args,
              ref: makeReference(dataId),
              storage: this.getPolicyActionStorage(storeFieldName),
              ...policyMeta,
            });
          });
        } else {
          policyAction(mutedCacheOperations, {
            id: dataId,
            storage: this.getPolicyActionStorage(dataId),
            ref: makeReference(dataId),
            ...policyMeta,
          });
        }
      });
    });
  }

  getRenewalPolicyForType(typename: string) {
    const { policies } = this.config;
    return (
      policies.types?.[typename]?.renewalPolicy ??
      policies.renewalPolicy ??
      RenewalPolicy.WriteOnly
    );
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

  // Runs the read poliy on the entity, returning whether its TTL was expired.
  runReadPolicy({
    typename,
    dataId,
    fieldName,
    storeFieldName,
    reportOnly = false,
  }: {
    typename: string,
    dataId: string,
    fieldName?: string,
    storeFieldName?: string,
    reportOnly?: boolean,
  }): boolean {
    const { cacheOperations, entityTypeMap, policies } = this.config;
    const entityId = makeEntityId(dataId, fieldName);
    const typeMapEntity = entityTypeMap.readEntityById(entityId);

    if (!typeMapEntity) {
      return false;
    }

    let entityCacheTime;

    // If a read is done against an entity before it has ever been written, it would not be present in the cache yet and should not attempt
    // to have read policy eviction run on it. This can occur in the case of fetching a query field over the network for example, where first
    // before it has come back from the network, the Apollo Client tries to diff it against the store to see what the existing value is for it,
    // but on first fetch it would not exist.
    if (storeFieldName && !!typeMapEntity.storeFieldNames) {
      const entityForStoreFieldName = typeMapEntity.storeFieldNames.entries[storeFieldName];

      if (!entityForStoreFieldName) {
        return false;
      }

      entityCacheTime = entityForStoreFieldName.cacheTime;
    } else {
      entityCacheTime = typeMapEntity.cacheTime;
    }

    const timeToLive =
      this.getPolicy(typename)?.timeToLive || policies.timeToLive;

    if (
      _.isNumber(entityCacheTime) &&
      timeToLive &&
      Date.now() > entityCacheTime + timeToLive
    ) {
      if (!reportOnly) {
        cacheOperations.evict({
          id: dataId,
          fieldName: storeFieldName,
          broadcast: false,
        });
      }
      return true;
    }
    return false;
  }

  activatePolicies(...policyEvents: InvalidationPolicyEvent[]) {
    policyEvents.forEach(policyEvent => this.activePolicyEvents[policyEvent] = true);
  }

  deactivatePolicies(...policyEvents: InvalidationPolicyEvent[]) {
    policyEvents.forEach(policyEvent => this.activePolicyEvents[policyEvent] = false);
  }

  isPolicyEventActive(policyEvent: InvalidationPolicyEvent) {
    return this.activePolicyEvents[policyEvent];
  }
}
