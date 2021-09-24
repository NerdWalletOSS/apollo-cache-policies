export const cacheExtensionsCollectionTypename = 'CacheExtensionsCollectionEntity';

export function collectionEntityIdForType(typename: string) {
  return `${cacheExtensionsCollectionTypename}:${typename}`;
}