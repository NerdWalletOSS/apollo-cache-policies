![Build](https://github.com/NerdWalletOSS/apollo-cache-policies/workflows/Build/badge.svg)

# Apollo Cache Policies

An extension of the [Apollo 3.0 cache](https://blog.apollographql.com/previewing-the-apollo-client-3-cache-565fadd6a01e) that introduces additional features including:

* Type-based `time-to-live` (TTL) support.
* Invalidation policies that codify relationships between types in the cache when entities are written or evicted.
* Normalized collections for accessing and filtering all entities of a particular type.
* Cached reactive variables to simplify persistent state management.

## Installation

```
npm install @nerdwallet/apollo-cache-policies
```
## Features

<details>
  <summary>
    Type Time-To-Lives (TTLs)
  </summary>

  <br>

  ## Summary

Type-based TTLs are useful when you want to specify requirements on how long an instance of a specific type should live in the cache before it becomes stale and unusable. When an entity is attempted to be read from the cache, it will be lazily evicted if it has been in the cache longer than it's TTL duration (specified in milliseconds) and will trigger any queries watching that data to rerun in order to fetch new data.

  ## Specification

  ```javascript
  import { InvalidationPolicyCache } from '@nerdwallet/apollo-cache-policies';

  const cache = new InvalidationPolicyCache({
    typePolicies: {...},
    invalidationPolicies: {
      timeToLive: Number;
      renewalPolicy: RenewalPolicy;
      types: {
        Typename: {
          timeToLive: Number,
          renewalPolicy: RenewalPolicy,
        }
      }
    }
  });
  ```

  ## Example Usage

  ```javascript
  import { InvalidationPolicyCache, RenewalPolicy } from '@nerdwallet/apollo-cache-policies';

  const cache = new InvalidationPolicyCache({
    typePolicies: {...},
    invalidationPolicies: {
      timeToLive: 3600 * 1000; // 1hr TTL on all types in the cache
      renewalPolicy: RenewalPolicy.WriteOnly;
      types: {
        Employee: {
          timeToLive: 3600 * 1000 * 24 // 24hr TTL specifically for the Employee type in the cache
        },
        EmployeeMessage: {
          renewalPolicy: RenewalPolicy.AccessAndWrite // The TTL for employee messages is renewed when the a message is read or written in the cache
        }
      }
    }
  });
  ```

  ## Extended Type API

  | Config          | Description                                                                                | Required | Default   |
  | ----------------| -------------------------------------------------------------------------------------------|----------|-----------|
  | `timeToLive`    | The global time to live in milliseconds for all types in the cache                         | ❌       | None      |
  | `renewalPolicy` | The policy for renewing an entity's time to live in the cache                              | ❌       | WriteOnly |

  ## Extended Cache APIs

  | Extended cache API       | Description                                                                               | Return Type                                                  | Arguments                    |
  | -------------------------| ------------------------------------------------------------------------------------------|--------------------------------------------------------------|------------------------------|
  | `expire`                 | Evicts all expired entities from the cache based on their type's or the global timeToLive | String[] - List of expired entity IDs evicted from the cache | ❌                           |
  | `expiredEntities`        | Returns all expired entities still present in the cache                                   | String[] - List of expired entities in the cache             | ❌                           |
  | `evictWhere`             | Evicts all entities matching the given filter from the cache                              | String[] - List of evicted entities from the cache           | `{ __typename: string, filter?: FragmentWhereFilter<EntityType> }` |

  ### Renewal Policies

  The renewal policy for a type TTL determines when the TTL should be renewed, such as when the entity is re-written into the cache from a recent network query.

  * **AccessOnly** - After first write, the entity in the cache will renew its TTL on read
  * **AccessAndWrite** - After first write, the entity will renew its TTL on read or write
  * **WriteOnly** - After first write, the entity in the cache will renew its TTL on write
  * **None** - After first write, the entity in the cache will never renew its TTL on reads or writes.

</details>

<details>
  <summary>
    Invalidation Policies
  </summary>

  <br>

  ## Summary

  Invalidation policies codify relationships between different types in the cache. Since the default `InMemoryCache` from Apollo is a key-value store, it does not maintain relationships between different cache entities. Invalidation policies introduce event-based (onWrite, onEvict) policies between parent/child type entities. Read more about the background for invalidation policies in [our blog post](https://danreynolds.ca/tech/2021/02/05/Apollo-Invalidation-Policies/).

  ## Specification

  ```javascript
  import { InvalidationPolicyCache } from '@nerdwallet/apollo-cache-policies';

  const cache = new InvalidationPolicyCache({
    typePolicies: {...},
    invalidationPolicies: {
      types: {
        Typename: {
          PolicyEvent: {
            Typename: (PolicyActionCacheOperation, PolicyActionEntity) => {}
            __default: (PolicyActionCacheOperation, DefaultPolicyActionEntity) => {}
          },
        }
      }
    }
  });
  ```

  ## Example Usage

  ```javascript
  import { ApolloClient, InMemoryCache } from "@apollo/client";
  import { InvalidationPolicyCache } from "@nerdwallet/apollo-cache-policies";

  export default new ApolloClient({
    uri: "http://localhost:4000",
    cache: new InvalidationPolicyCache({
      typePolicies: {...},
      invalidationPolicies: {
        types: {
          DeleteEmployeeResponse: {
            // Delete an entity from the cache when it is deleted on the server
            onWrite: {
              Employee: ({ evict, readField }, { id, ref, parent: { variables } }) => {
                if (parent.variables.employeeId === readField('id', ref)) {
                  evict({ id });
                }
              },
            }
          },
          Employee: {
            // Evict every message in the cache for an employee when they are evicted
            onEvict: {
              EmployeeMessage: ({ readField, evict }, { id, ref, parent }) => {
                if (readField('employee_id', ref) === readField('id', parent.ref)) {
                  evict({ id });
                }
              },
            }
          },
          EmployeeMessage: {
            // Perform a side-effect whenever an employee message is evicted
            onEvict: (_cacheOperations, { parent: { id } }) => {
              console.log(`Employee message ${id} was evicted`);
            }
          },
          CreateEmployeeResponse: {
            // Add an entity to a cached query when the parent type is written
            onWrite: {
              EmployeesResponse: ({ readField, modify }, { storeFieldName, parent }) => {
                modify({
                  fields: {
                    [storeFieldName]: (employeesResponse) => {
                      const createdEmployeeResponse = readField({
                        fieldName: parent.fieldName,
                        args: parent.variables,
                        from: parent.ref,
                      });
                      return {
                        ...employeesResponse,
                        data: [
                          ...employeesResponse.data,
                          createdEmployeesResponse.data,
                        ]
                      }
                    }
                  }
                });
              },
            },
          },
        }
      }
    })
  });
  ```
  ## Invalidation Policies Cache API

  The extended policies are by default triggered for on read, write or eviction of entities in the cache by type. If you want to enable or disable particular support for particular events in your application, this can be done with the extended cache APIs for policy events.
  
  | Policy Event   | Description                                                                                | Required |
  | ---------------| -------------------------------------------------------------------------------------------|----------|
  | `onWrite`      | On writing parent entity into cache, perform action for each type under the parent         | false    |
  | `onEvict`      | On evicting parent entity from cache, perform policy action for each type under the parent | false    |

  | Policy Action Cache Operation | Description                        |
  | ------------------------------| -----------------------------------|
  | `evict`                       | `evict` API from Apollo cache      |
  | `modify`                      | `modify` API from Apollo cache     |
  | `readField`                   | `readField` API from Apollo cache  |

  | Extended cache API       | Description                                                                               | Return Type                                                  | Arguments                    |
  | -------------------------| ------------------------------------------------------------------------------------------|--------------------------------------------------------------|------------------------------|
  | `activePolicyEvents`     | Returns all active policy events (Read, Write, Evict)                                     | InvalidationPolicyEvent[] - List of active policy events     | ❌                           |
  | `activatePolicyEvents`   | Activates the provided policy events, defaults to all                                     | void                                                         | ...InvalidationPolicyEvent[] |
  | `deactivatePolicyEvents` | Dectivates the provided policy events, defaults to all                                    | void                                                         | ...InvalidationPolicyEvent[] |

  ## Policy Action Entity API

  When an invalidation policy event is triggered, it will provide you with all the metadata required about which parent entity triggered the event and which child entity is affected.

  | Policy Action Entity | Description                                             | Type               | Example                                                                                     |
  | ---------------------| --------------------------------------------------------|--------------------| ---------------------------------------------------------------------------------------------|
  | `id`                 | The id of the entity in the Apollo cache                | string              | `Employee:1`, `ROOT_QUERY`                                                                  |
  | `ref`                | The reference object for the entity in the Apollo cache | Reference           | `{ __ref: 'Employee:1' }`, `{ __ref: 'ROOT_QUERY' }`                                        |
  | `fieldName`          | The field for the entity in the Apollo cache            | string?             | `employees`                                                                                 |
  | `storeFieldName`     | The `fieldName` combined with its distinct variables    | string?             | `employees({ location: 'US' })`                                                             |
  | `variables`          | The variables the entity was written with               | Object?             | `{ location: 'US' }`                                                                        |
  | `args`               | The args the field was written with                     | Object?             | `{ location: 'US' }`                                                                        |
  | `storage`            | An object for storing unique entity metadata across policy action invocations | Object            | `{}`                                                                    |
  | `parent`             | The parent entity that triggered the PolicyEvent        | PolicyActionEntity  | `{ id: 'ROOT_QUERY', fieldName: 'deleteEmployees', storeFieldName: 'deleteEmployees({}), ref: { __ref: 'ROOT_QUERY' }, variables: {} }'` |

  | Default Policy Action Entity | Description                                                                   | Type               | Example                                                                                     |
  | -----------------------------| ------------------------------------------------------------------------------|---------------------| ---------------------------------------------------------------------------------------------|
  | `storage`                    | An object for storing unique entity metadata across policy action invocations | Object              | `{}`                                                                        |
  | `parent`                     | The parent entity that triggered the PolicyEvent                              | PolicyActionEntity  | `{ id: 'ROOT_QUERY', fieldName: 'deleteEmployees', storeFieldName: 'deleteEmployees({}), ref: { __ref: 'ROOT_QUERY' }, variables: {} }'` |

</details>

<details>
  <summary>
    Normalized Collections
  </summary>

  <br>

  ## Summary

  Normalized collections introduce ways of accessing and filtering all entities in the cache of a given type. They are useful for scenarios where clients may want to access all entities in the cache of a particular type matching a set of filters like a list of all products to show or all the messages of a conversation. To read more about the motivation for this feature, check out [our blog post](https://danreynolds.ca/tech/2021/09/23/Apollo-Normalized-Collections/).

  To use normalized collections, enable it in the cache with the collections flag below:

  ```javascript
  import { InvalidationPolicyCache } from '@nerdwallet/apollo-cache-policies';

  const cache = new InvalidationPolicyCache({
    enableCollections: true,
    typePolicies: {...},
    invalidationPolicies: {...}
  });
  ```

  ## Specification

  Normalized collections introduce 4 new APIs:

  1. `useFragmentWhere`: A new React hook for filtering a collection of entities by type
  2. `cache.readReferenceWhere`: A cache API that returns a list of references in the cache for a particular type and filter
  3. `cache.readFragmentWhere`: The collection filter equivalent of the existing cache.readFragment API
  4. `cache.watchFragmentWhere`: The collection filter equivalent of the existing cache.watchFragment API

  ## useFragmentWhere

  The `useFragmentWhere` API allows us to query for a filtered collection of entities by type. It takes two arguments, a GraphQL fragment for the fields to read from the type and an object of all the fields to filter by.

  ### Example Usage

  Now our client can filter all entites of a particular type in the cache like `Employee` in one operation without having to write any type policies.

  ```js
  import { useFragmentWhere } from '@nerdwallet/apollo-cache-policies';

  const { data } = useFragmentWhere(
    gql`
      fragment EmployeesByTeam on Employee {
        id
        name
      }
    `,
    {
      team: 'Banking',
    }
  )
  ```

  If we just want to retrieve all entities in the cache for a particular type, we can omit the filter altogether:

  ```js
  import { useFragmentWhere } from '@nerdwallet/apollo-cache-policies';

  const { data } = useFragmentWhere(
    gql`
      fragment AllEmployees on Employee {
        id
        name
      }
    `
  )
  ```

  The `useFragmentWhere` API will automatically update the component just like `useQuery` when the employees that match the filter change, including when a new employee that matches the filter criteria is added to the cache.

  > Note: `useFragmentWhere` subscribes to data changes based on the fragment name you provide, so to return different data from different calls to the API you will want to use different fragment names.

  ## Cache.readReferenceWhere

  Normalized collections can be accessed in type policies using the new `cache.readReferenceWhere` API. `readReferenceWhere` will return a list of references for a given type and filter.

  ### Example Usage

  ```js
  const cache = new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          readBankingTeam: {
            read(_existingBankingTeam, { cache }) {
              return cache.readReferenceWhere<Employee>(
                {
                  __typename: 'Employee',
                  filter: {
                    team: 'Banking',
                  },
                }
              );
            }
          },
        },
      },
    },
  });
  ```

  In this example, we use the `readReferenceWhere` API to construct a type policy that returns all entities of the `Employee` type in the cache with a field `team` matching the value `Banking`. Any number of fields can be used as filters and queries for this type policy will automatically update whenever an employee entity is added, created removed from the cache.

</details>

<details>
  <summary>
    Cached Reactive Variables
  </summary>

  <br>

  ## Summary

  Reactive variables are a powerful and lightweight API for managing local state with Apollo. In cases where client state should be persisted across sessions, it would be helpful to be able to persist reactive variables as well.

  Cached reactive variables work the same as regular ones, with the additional function of writing their current value to the cache. Applications still need to set up their own cache persistence using tools like [Apollo Cache Persist](https://github.com/apollographql/apollo-cache-persist). Once cache persistence is in place, cached reactive variables will be rehydrated on new sessions with a runtime value from the cache.
  ## Example Usage

  The only difference in the API when working with cached reactive variables is that a unique ID must be specified for caching. They can then be initialized with a default value, read and written to using the same APIs
  as other reactive variables.

  ```javascript
  import { makeCachedVar } from '@nerdwallet/apollo-cache-policies';

  const rv = makeCachedVar('identifier', false);
  rv(true);
  console.log(rv()); // true
  ```
</details>
