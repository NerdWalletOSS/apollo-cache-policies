import { filter as _filter } from "lodash-es";

interface AuditLogEntry {
  time: number;
  type: string;
  event: string;
  meta?: Record<string, any>;
  group?: string;
}

export default class AuditLog {
  private _log: AuditLogEntry[] = [];

  log(event: string, type: string, group?: string, meta?: Record<string, any>) {
    const auditLogEntry = {
      time: Date.now(),
      type,
      event,
      meta,
      group,
    };
    this._log.push(auditLogEntry);
  }

  getLog(filter: AuditLogEntry) {
    return _filter(this._log, filter);
  }

  printLog(filter: AuditLogEntry) {
    this.getLog(filter).forEach(this.printLogEntry);
  }

  printLogEntry(entry: AuditLogEntry) {
    console.log(`%c event: ${entry.event}`, "color: green");
    console.group();
    console.log(`type: ${entry.type}`);
    console.log(`time: ${entry.time}`);
    console.log(`meta: ${JSON.stringify(entry.meta ?? {})}`);
    console.groupEnd();
  }
}
