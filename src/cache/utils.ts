export const cacheExtensionsCanonicalEntityTypename = 'CacheExtensionsCanonicalEntity';

export function canonicalEntityIdForType(typename: string) {
  return `${cacheExtensionsCanonicalEntityTypename}:${typename}`;
}