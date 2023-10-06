import { DocumentNode, FragmentDefinitionNode } from 'graphql';
import { WatchFragmentOptions, WatchFragmentWhereOptions } from './types';
import { InvalidationPolicyCache } from '../cache';
import { Policies } from '@apollo/client/cache/inmemory/policies';
import { makeReference, ReactiveVar } from '@apollo/client/core';
import { FragmentWhereFilter, FragmentWhereOrderBy } from '../cache/types';

function _generateQueryFromFragment({
  fieldName,
  fragmentDefinition,
}: {
  fieldName: string;
  fragmentDefinition: FragmentDefinitionNode;
}): DocumentNode {
  return {
    kind: 'Document',
    definitions: [
      {
        directives: [],
        variableDefinitions: [],
        kind: 'OperationDefinition',
        operation: 'query',
        selectionSet: {
          kind: 'SelectionSet',
          selections: [
            {
              arguments: [],
              kind: "Field",
              name: { kind: "Name", value: fieldName },
              directives: [
                {
                  arguments: [],
                  kind: 'Directive',
                  name: { kind: "Name", value: "client" },
                },
              ],
              selectionSet: fragmentDefinition.selectionSet,
            },
          ]
        },
      }
    ],
  };
}

// Returns a query that can be used to watch a normalized cache entity by converting the fragment to a query
// and dynamically adding a type policy that returns the entity.
export function buildWatchFragmentQuery(
  options: WatchFragmentOptions & {
    fieldName: string;
    policies: Policies,
  }
): DocumentNode {
  const { fragment, id, policies, fieldName } = options;
  const fragmentDefinition = fragment.definitions[0] as FragmentDefinitionNode;

  const query = _generateQueryFromFragment({
    fragmentDefinition: fragmentDefinition,
    fieldName,
  });

  // @ts-ignore The getFieldPolicy is private but we need it here to determine
  // if the dynamic type policy we generate for the corresponding fragment has
  // already been added
  if (!policies.getFieldPolicy('Query', fieldName)) {
    policies.addTypePolicies({
      Query: {
        fields: {
          [fieldName]: {
            read(_existing) {
              return makeReference(id);
            }
          }
        }
      }
    });
  }

  return query;
}

// Returns a query that can be used to watch a filtered list of normalized cache entities by converting the fragment to a query
// and dynamically adding a type policy that returns the list of matching entities.
export function buildWatchFragmentWhereQuery<FragmentType>(options: WatchFragmentWhereOptions<FragmentType> & {
  cache: InvalidationPolicyCache;
  policies: Policies;
  filterVar: ReactiveVar<FragmentWhereFilter<FragmentType> | undefined>;
  limitVar: ReactiveVar<number | undefined>;
  orderByVar: ReactiveVar<FragmentWhereOrderBy | undefined>;
  fieldName: string;
}): DocumentNode {
  const { fragment, filterVar, limitVar, orderByVar, policies, cache, fieldName, } = options;
  const fragmentDefinition = fragment.definitions[0] as FragmentDefinitionNode;
  const __typename = fragmentDefinition.typeCondition.name.value;

  const query = _generateQueryFromFragment({
    fragmentDefinition,
    fieldName,
  });

  // @ts-ignore The getFieldPolicy is private but we need it here to determine
  // if the dynamic type policy we generate for the corresponding fragment has
  // already been added
  if (!policies.getFieldPolicy('Query', fieldName)) {
    policies.addTypePolicies({
      Query: {
        fields: {
          [fieldName]: {
            read(_existing) {
              return cache.readReferenceWhere({
                __typename,
                filter: filterVar(),
                limit: limitVar(),
                orderBy: orderByVar(),
              });
            }
          }
        }
      }
    });
  }

  return query;
}