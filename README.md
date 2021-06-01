![Build](https://github.com/NerdWalletOSS/apollo-cache-policies/workflows/Build/badge.svg)

# Apollo Cache Policies

> Update: This library is now called Apollo Cache Policies and available at `@nerdwallet/apollo-cache-policies`.

An extension of the [Apollo 3.0 cache](https://blog.apollographql.com/previewing-the-apollo-client-3-cache-565fadd6a01e) that provides a framework for managing the lifecycle and relationships of cache data through the use of additional cache policies.

## Installation

```
npm install @nerdwallet/apollo-cache-policies
```

## Usage

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
        PolicyEvent: {
          Typename: (PolicyActionCacheOperation, PolicyActionEntity) => {}
          __default: (PolicyActionCacheOperation, DefaultPolicyActionEntity) => {}
        },
      }
    }
  }
});
```

| Config          | Description                                                                                | Required | Default   |
| ----------------| -------------------------------------------------------------------------------------------|----------|-----------|
| `timeToLive`    | The global time to live in milliseconds for all types in the cache                         | false    | None      |
| `types`         | The types for which cache policies have been defined                                       | false    | None      |
| `renewalPolicy` | The policy for renewing an entity's time to live in the cache                              | false    | WriteOnly |

### Renewal policies:

* **AccessOnly** - After first write, the entity in the cache will renew its TTL on read
* **AccessAndWrite** - After first write, the entity will renew its TTL on read or write
* **WriteOnly** - After first write, the entity in the cache will renew its TTL on write
* **None** - After first write, the entity in the cache will never renew its TTL on reads or writes.

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
| `expire`                 | Evicts all expired entities from the cache based on their type's or the global timeToLive | String[] - List of expired entity IDs evicted from the cache | N/A                          |
| `expiredEntities`        | Returns all expired entities still present in the cache                                   | String[] - List of expired entities in the cache             | N/A                          |
| `activePolicyEvents`     | Returns all active policy events (Read, Write, Evict)                                     | InvalidationPolicyEvent[] - List of active policy events     | N/A                          |
| `activatePolicyEvents`   | Activates the provided policy events, defaults to all                                     | void                                                         | ...InvalidationPolicyEvent[] |
| `deactivatePolicyEvents` | Dectivates the provided policy events, defaults to all                                    | void                                                         | ...InvalidationPolicyEvent[] |

| Policy Action Entity | Description                                             | Type               | Example                                                                                     |
| ---------------------| --------------------------------------------------------|--------------------| ---------------------------------------------------------------------------------------------|
| `id`                 | The id of the entity in the Apollo cache                | string              | `Employee:1`, `ROOT_QUERY`                                                                  |
| `ref`                | The reference object for the entity in the Apollo cache | Reference           | `{ __ref: 'Employee:1' }`, `{ __ref: 'ROOT_QUERY' }`                                        |
| `fieldName`          | The field for the entity in the Apollo cache            | string?             | `employees`                                                                                 |
| `storeFieldName`     | The `fieldName` combined with its distinct variables    | string?             | `employees({ location: 'US' })`                                                             |
| `variables`          | The variables the entity was written with               | Object?             | `{ location: 'US' }`                                                                        |
| `storage`            | An object for storing unique entity metadata across policy action invocations | Object            | `{}`                                                                        |
| `parent`             | The parent entity that triggered the PolicyEvent        | PolicyActionEntity  | `{ id: 'ROOT_QUERY', fieldName: 'deleteEmployees', storeFieldName: 'deleteEmployees({}), ref: { __ref: 'ROOT_QUERY' }, variables: {} }'` |

| Default Policy Action Entity | Description                                                                   | Type               | Example                                                                                     |
| -----------------------------| ------------------------------------------------------------------------------|---------------------| ---------------------------------------------------------------------------------------------|
| `storage`                    | An object for storing unique entity metadata across policy action invocations | Object              | `{}`                                                                        |
| `parent`                     | The parent entity that triggered the PolicyEvent                              | PolicyActionEntity  | `{ id: 'ROOT_QUERY', fieldName: 'deleteEmployees', storeFieldName: 'deleteEmployees({}), ref: { __ref: 'ROOT_QUERY' }, variables: {} }'` |

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
          onEvict: {
            __default: (_cacheOperations, { parent: { id } }) => {
              console.log(`Employee message ${id} was evicted`);
            },
          },
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
          EmployeesResponse: {
            // Assign a time-to-live for types in the store. If accessed beyond their TTL,
            // they are evicted and no data is returned.
            timeToLive: 3600,
          }
        },
      }
    }
  })
});
```

<details>
  <summary>
    Why does this exist?
  </summary>

The Apollo client cache is a powerful tool for managing client data with support for optimistic data, request retrying, polling and with Apollo 3.0, robust cache modification and eviction.

The client cache stores entries in a normalized data model. A query for fetching a list of employees like this:

```javascript
import gql from "@apollo/client";

const employeesQuery = gql`
  query GetEmployees {
    employees {
      id
      name
    }
  }
`;
```

Would be represented in the cache like this:

```javascript
{
    ROOT_QUERY: {
        __typename: 'Query',
        employees: {
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

Invalidation in the Apollo cache is limited and is a common source of consternation in the Apollo community:

- https://github.com/apollographql/apollo-client/issues/899
- https://github.com/apollographql/apollo-feature-requests/issues/4
- https://github.com/apollographql/apollo-feature-requests/issues/5#issuecomment-491024981

The automatic cache invalidation provided by Apollo is missing two categories of cache invalidation:

### 1. Creating/deleting entities

Because it uses a normalized data cache, any updates to entities in the cache will be consistent across cached queries that contain them such as in lists or nested data objects. This does not work when creating or deleting entities, however, since it does not know to add any new entities to cached queries or remove them when a mutation deletes an entity from the server.

The Apollo cache allows clients to handle these scenarios with a query update handler:

```javascript
const createEntity = await apolloClient.mutate({
  mutation: CreateEntity,
  variables: newEntityData
  update: (cache, { data: createEntityResult }) => {
    const cachedEntities = cache.readQuery({ query: GetAllEntities });
    cache.writeQuery({
      query: GetAllEntities,
      data: {
        GetAllEntities: {
          __typename: 'GetEntityResponse',
          entities: [...cachedEntities.entities, createEntityResult.entity],
        },
      },
    });
  },
});
```

This requires the client to specify an update handler at the mutation call site and manually read, modify and write that data back into the cache. While this works, the code does not scale well across multiple usages of the same mutation or for highly relational data where a mutation needs to invalidate various cached entities.

### 2. Cache dependencies

The Apollo cache has powerful utilities for interacting with the cache, but does not have a framework for managing the lifecycle and dependencies between entities in the cache.

If a cache contains multiple entities like a user's profile, messages, and posts, then deleting their profile should invalidate all cached queries containing their messages and posts.

</details>

<details>
  <summary>
    FAQs
  </summary>

### What use cases is this project targetting?

The Apollo cache is not a relational datastore and as an extension of it, these cache policies are not going to be the best solution for every project. At its core it's a for loop that runs for each child x of type T when a matching policy event occurs for parent entity y of type T2. If your cache will consist of thousands of x's and y's dependent on each other with frequent policy triggers, then something like a client-side database would be a better choice. Our goal has been decreasing developer overhead when having to manage the invalidation of multiple of distinct, dependent cached queries.

### Why a new cache and not a link?

Apollo links are great tools for watching queries and mutations hitting the network. There even exists a [Watched Mutation](https://github.com/afafafafafaf/apollo-link-watched-mutation) link which provides some of the desired behavior of this library.

At a high level, links run on the network-bound queries/mutations. These additional policies run on the types
that are being written and evicted from your cache, which this library believes is a better level at which to manage cache operations.

At a low level, links:

- Only process queries/mutations that hit the network, so they will not work for operations hitting only the cache including `@client` directive queries and mutations.
- Cannot form type relationships, only query/mutation relationships. If a mutation for deleting an Employee cache entry should also delete all their
  EmployeeMessage and EmployeePost types, links cannot represent that type to type relationship.
- Links miss directly modified cached data. If eviction of an Employee cache entity occurs because the client called `cache.evict` directly, links will not be able to process
  anything in relation to what should happen in response to that eviction.

### Why not establish schema relationships on the server?

This was also something that was explored, and it is possible to do this with custom directives:

```javascript
  type Employee @invalidates(own: [EmployeeMessage, EmployeePost]) {
    id
  }
  type DeleteEmployeeResponse {
    success: Boolean!
  }
  type TotalEmployeesResponse {
    count: Number!
  }
  extend type Query {
    totalEmployees(
    ): TotalEmployeesResponse
  }
  extend type Mutation {
    deleteFinancialPortal(
      financialPortalId: ID!
    ): DeleteFinancialPortalResponse @invalidates(own: [Employee], any: [TotalEmployeesResponse])
  }
```

These schema rules could then be consumable on the client either via a `invalidationSchema` introspection query, or just an exported file. We looked into this but found it more limiting for now because of the limited ability of the schema language to express complex scenarios.

</details>
