import _ from "lodash";
import { fieldNameFromStoreName } from "@apollo/client/cache/inmemory/helpers";
import { makeEntityId, isQuery } from "../helpers";
import {
  EntitiesByType,
  EntitiesById,
  ExtractedTypeMap,
  TypeMapEntities,
  TypeMapEntity,
} from "./types";

/**
 * Map which stores a relationship between entities in the cache and their type
 * for efficient access of entities by type and types by entities on top of the Apollo EntityStore cache.
 * 
 * An Apollo cache entry might look like this:
 * ```javascript
    {
      ROOT_QUERY: {
        __typename: 'Query',
        employees({ filter: x }): {
            __typename: 'EmployeesResponse',
            data: [{ __ref: 'Employee:1' }, { __ref: 'Employee:2' }]
        }
      },
      'Employee:1': {
        __typename: 'Employee',
        id: 1,
        name: 'Alice',
      },
      'Employee:2': {
        __typename: 'Employee',
        id: 2,
        name: 'Bob',
      }
    }
    ```

    and an EntityTypeMap structure on top of that would look like this:
    ```javascript
    {
      entitiesByType: {
      Employee: {
        "Employee:1": {
          dataId: 'Employee:1',
          typename: 'Employee',
          cacheTime: 100000,
          fieldName: null,
          storeFieldNames: null,
        },
        "Employee:2": {
          dataId: 'Employee:2',
          typename: 'Employee',
          cacheTime: 100000,
          fieldName: null,
          storeFieldNames: null,
        }
      },
      EmployeesResponse: {
        "employees": {
          dataId: 'ROOT_QUERY',
          fieldName: 'employees',
          typename: 'EmployeesResponse',
          storeFieldNames: {
            __size: 1,
            entries: {
              employees({ filter:x }): {
                cacheTime: 10000,
              }
            }
          }
        }
      }
    },
    entitiesById: {
      "Employee:1": {
        dataId: 'Employee:1',
        typename: 'Employee',
        cacheTime: 100000,
      },
      "Employee:2": {
        dataId: 'Employee:2',
        typename: 'Employee',
        cacheTime: 100000,
      },
      "ROOT_QUERY.employees": {
        dataId: 'ROOT_QUERY',
        fieldName: 'employees',
        typename: 'EmployeesResponse',
        storeFieldNames: {
          entries: {
            employees({ filter:x }): {
              cacheTime: 10000,
            }
          }
        }
      }
    }
    ```
 */
export default class EntityTypeMap {
  private entitiesByType: EntitiesByType = {};
  private entitiesById: EntitiesById = {};

  write(
    typename: string,
    dataId: string,
    storeFieldName?: string | null,
    variables?: Record<string, any>
  ) {
    const fieldName = storeFieldName
      ? fieldNameFromStoreName(storeFieldName)
      : undefined;
    const entityId = makeEntityId(dataId, fieldName);
    const existingTypeMapEntity = this.readEntityById(entityId);

    if (existingTypeMapEntity) {
      if (isQuery(dataId) && storeFieldName) {
        const storeFieldNameEntry = existingTypeMapEntity.storeFieldNames!
          .entries[storeFieldName];
        if (storeFieldNameEntry) {
          storeFieldNameEntry.variables = variables;
        } else {
          existingTypeMapEntity.storeFieldNames!.entries[storeFieldName] = {
            variables,
          };
          existingTypeMapEntity.storeFieldNames!.__size++;
        }
      }
    } else {
      let newEntity: TypeMapEntity;
      const cacheTime = Date.now();

      if (isQuery(dataId) && storeFieldName) {
        newEntity = {
          dataId,
          typename,
          fieldName,
          storeFieldNames: {
            __size: 1,
            entries: {
              [storeFieldName]: { variables, cacheTime },
            },
          },
        };
      } else {
        newEntity = {
          dataId,
          typename,
          cacheTime,
        };
      }

      _.set(this.entitiesByType, [typename, entityId], newEntity);
      this.entitiesById[entityId] = newEntity;
    }
  }

  evict(dataId: string, storeFieldName?: string): void {
    const fieldName = storeFieldName
      ? fieldNameFromStoreName(storeFieldName)
      : null;
    const entityId = makeEntityId(dataId, fieldName);
    const entity = this.readEntityById(entityId);

    if (!entity) {
      return;
    }

    // If the fieldName is the same as the passed storeFieldName, then all argument variants of that field
    // are being removed.
    if (storeFieldName && fieldName !== storeFieldName) {
      const storeFieldNameEntries = this.entitiesByType[entity.typename][
        entityId
      ]?.storeFieldNames;
      if (storeFieldNameEntries) {
        if (storeFieldNameEntries.__size === 1) {
          delete this.entitiesByType[entity.typename][entityId];
          delete this.entitiesById[entityId];
        } else {
          storeFieldNameEntries.__size--;
          delete storeFieldNameEntries.entries[storeFieldName];
        }
      }
    } else {
      delete this.entitiesByType[entity.typename][entityId];
      delete this.entitiesById[entityId];
    }
  }

  readEntitiesByType(typeName: string): TypeMapEntities | null {
    return this.entitiesByType[typeName] || null;
  }

  readEntityById(entityId: string): TypeMapEntity | null {
    return this.entitiesById[entityId] || null;
  }

  renewEntity(dataId: string, storeFieldName?: string) {
    const fieldName = storeFieldName
      ? fieldNameFromStoreName(storeFieldName)
      : undefined;
    const entity = this.entitiesById[makeEntityId(dataId, fieldName)];

    if (entity) {
      const cacheTime = Date.now();
      if (isQuery(dataId) && storeFieldName) {
        entity.storeFieldNames!.entries[storeFieldName]!.cacheTime = cacheTime;
      } else {
        entity.cacheTime = cacheTime;
      }
    }
  }

  restore(entitiesById: EntitiesById) {
    this.entitiesById = entitiesById;
    Object.keys(entitiesById).forEach((entityId: string) => {
      const entity = entitiesById[entityId];
      if (!this.entitiesByType[entity.typename]) {
        this.entitiesByType[entity.typename] = {};
      }
      this.entitiesByType[entity.typename][entityId] = entity;
    });
  }

  extract(): ExtractedTypeMap {
    const { entitiesById, entitiesByType } = this;
    return _.cloneDeep({
      entitiesById,
      entitiesByType,
    });
  }

  clear() {
    this.entitiesById = {};
    this.entitiesByType = {};
  }
}
