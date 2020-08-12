import InvalidationPolicyManager from "../policies/InvalidationPolicyManager";
import AuditLog from "./AuditLog";
import {
  PolicyActionMeta,
  InvalidationPolicyManagerConfig,
} from "../policies/types";

export enum AuditType {
  Read = "Read",
  Write = "Write",
  Evict = "Evict",
}

interface InvalidationPolicyManagerAuditorConfig
  extends InvalidationPolicyManagerConfig {
  auditLog: AuditLog;
}

export default class InvalidationPolicyManagerAuditor extends InvalidationPolicyManager {
  private auditLog: AuditLog;

  constructor(config: InvalidationPolicyManagerAuditorConfig) {
    super(config);
    this.auditLog = config.auditLog;
  }

  runReadPolicy(
    typename: string,
    dataId: string,
    fieldName?: string,
    storeFieldName?: string
  ) {
    this.auditLog.log(
      "Running read policy",
      AuditType.Read,
      "InvalidationPolicyManager",
      {
        storeFieldName,
        typename,
        dataId,
        fieldName,
      }
    );

    return super.runReadPolicy(typename, dataId, fieldName, storeFieldName);
  }

  runWritePolicy(typeName: string, policyMeta: PolicyActionMeta) {
    this.auditLog.log(
      "Running write policy",
      AuditType.Write,
      "InvalidationPolicyManager",
      {
        typeName,
        ...policyMeta,
      }
    );

    return super.runWritePolicy(typeName, policyMeta);
  }

  runEvictPolicy(typeName: string, policyMeta: PolicyActionMeta) {
    this.auditLog.log(
      "Running evict policy",
      AuditType.Write,
      "InvalidationPolicyManager",
      {
        typeName,
        ...policyMeta,
      }
    );

    return super.runEvictPolicy(typeName, policyMeta);
  }
}
