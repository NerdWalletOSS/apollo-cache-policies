1.0.0-beta16 (Dan Reynolds)

- Release new version with React dependencies removed.

1.0.0-beta15 (Dan Reynolds)

- Fix bug where a renew-on-read policy would try to update the cache time for entities not present in the cache

1.0.0-beta14 (Dan Reynolds)

- Bugfix for fixing eviction/mutation changes to the cache via the wrapper `wrapDestructiveCacheMethod` function. 

1.0.0-beta13 (Dan Reynolds)

- Short-term fix that adds support for running the lib in environments that cannot handle import statements by removing imports from non-public Apollo APIs.
The required imports will be made available in an upcoming version of Apollo Client and we'll switch to that better fix at that time.

1.0.0-beta12 (Dan Reynolds)

- Add support for dynamically activating/deactivating policy events

1.0.0-beta11 (Dan Reynolds)

- Default the `readPolicy` function in the policy action to use the ROOT_QUERY similarly to how the policies module does in apollo/client

1.0.0-beta10 (Dan Reynolds)

- Add support for a default policy action to perform side effects whenever a specific type is written/evicted from the cache

1.0.0-beta9 (Dan Reynolds)

- Add `expiredEntities` API for accessing the expired entities in the cache without evicting them

1.0.0-beta8 (Dan Reynolds)

- Add test for Write-on-Write policies where the mutation has arguments and fix the Readme to illustrate how to correctly write the invalidation policy in that case

1.0.0-beta7 (Dan Reynolds)

- Fix issue where read policies were attempted to be evaluated for non-normalized entities not yet in the cache if they had a different store field name with the same name
  already written in the cache.

1.0.0-beta6 (Dan Reynolds)

- Adds a `storage` dictionary by unique `storeFieldName` for queries or `ID` for normalized entities in the policy action object so that arbitrary meta information can be stored across multiple policy action invocations.

1.0.0-beta5 (Dan Reynolds)

- Adds support for a `renewalPolicy` type and global config option for specifying how type TTLs should be renewed on write vs access
- Adds the `expire` API for evicting all entities that have expired in the cache based on their type's or the global TTL.

1.0.0-beta4 (Dan Reynolds)

- [BREAKING CHANGE] Adds support for a default TTL option that applies to all types

1.0.0-beta3 (Dan Reynolds)

- Ensure that empty field arguments are still passed as an empty object as the variables in the policy event.

1.0.0-beta2 (Dan Reynolds)

- Bumps to latest Apollo version (3.1)
- Adds audit logging for better entity debugging through the type map and invalidation policy manager

1.0.0-beta1 (Dan Reynolds)

- Initial beta release 🚀