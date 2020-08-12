import EntityTypeMap from "../entity-store/EntityTypeMap";
import AuditLog from "./AuditLog";

interface EntityTypeMapAudtiorConfig {
  auditLog: AuditLog;
}

enum EntityTypeMapAuditorEvent {
  Write = "Write",
  Evict = "Evict",
}

export default class EntityTypeMapAudtior extends EntityTypeMap {
  private auditLog: AuditLog;

  constructor(config: EntityTypeMapAudtiorConfig) {
    super();
    this.auditLog = config.auditLog;
  }

  write(
    typename: string,
    dataId: string,
    storeFieldName?: string | null,
    variables?: Record<string, any>
  ) {
    this.auditLog.log(
      "Writing to type map",
      EntityTypeMapAuditorEvent.Write,
      "EntityTypeMap",
      {
        typename,
        dataId,
        storeFieldName,
        variables,
      }
    );
    return super.write(typename, dataId, storeFieldName, variables);
  }

  evict(dataId: string, storeFieldName?: string): void {
    this.auditLog.log(
      "Evicting from type map",
      EntityTypeMapAuditorEvent.Evict,
      "EntityTypeMap",
      {
        dataId,
        storeFieldName,
      }
    );
    return super.evict(dataId, storeFieldName);
  }
}
