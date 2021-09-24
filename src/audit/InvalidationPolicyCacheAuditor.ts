import InvalidationPolicyCache from "../cache/InvalidationPolicyCache";
import { CacheResultProcessor } from "../cache/CacheResultProcessor";
import InvalidationPolicyManagerAuditor from "./InvalidationPolicyManagerAuditor";
import EntityTypeMapAuditor from "./EntityTypeMapAuditor";
import { InvalidationPolicyCacheConfig } from "../cache/types";
import AuditLog from "./AuditLog";
import { EntityStoreWatcher } from "../entity-store";

export default class InvalidationPolicyCacheAuditor extends InvalidationPolicyCache {
  auditLog = new AuditLog();

  constructor(config: InvalidationPolicyCacheConfig) {
    super(config);
    const { invalidationPolicies = {} } = config;

    this.entityTypeMap = new EntityTypeMapAuditor({ auditLog: this.auditLog });
    new EntityStoreWatcher({
      entityStore: this.entityStoreRoot,
      entityTypeMap: this.entityTypeMap,
      policies: this.policies,
      updateCollectionField: this.updateCollectionField.bind(this),
    });
    this.invalidationPolicyManager = new InvalidationPolicyManagerAuditor({
      auditLog: this.auditLog,
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
}
