import { NormalizedCacheObject } from "@apollo/client";

export interface TypeMapEntity {
  dataId: string;
  typename: string;
  fieldName?: string;
  cacheTime?: number;
  storeFieldNames?: {
    __size: number;
    entries: {
      [index: string]: {
        cacheTime: number;
        variables?: Record<string, any>;
      };
    };
  };
}

export interface ExtractedTypeMapObject {
  [key: string]: {
    cacheTime: number;
  };
}

export interface EntitiesByType {
  [index: string]: {
    [index: string]: TypeMapEntity;
  };
}

export interface EntitiesById {
  [index: string]: TypeMapEntity;
}

export interface TypeMapEntities {
  [index: string]: TypeMapEntity;
}

export interface ExtractedTypeMap {
  entitiesById: EntitiesById;
  entitiesByType: EntitiesByType;
}

export interface NormalizedCacheObjectWithInvalidation
  extends NormalizedCacheObject {
  invalidation: {
    entitiesById: EntitiesById;
  };
}
