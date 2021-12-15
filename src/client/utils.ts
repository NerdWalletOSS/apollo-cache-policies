import { DocumentNode, FragmentDefinitionNode } from 'graphql';
import { WatchFragmentOptions, WatchFragmentWhereOptions } from './types';
import { InvalidationPolicyCache } from '../cache';
import { Policies } from '@apollo/client/cache/inmemory/policies';
import { makeReference } from '@apollo/client/core';

function _generateQueryFromFragment({
  fieldName,
  watchDefinition,
  definitions,
}: {
  fieldName: string;
  definitions: FragmentDefinitionNode[];
  watchDefinition: FragmentDefinitionNode;
}): DocumentNode {
  return {
    kind: 'Document',
    definitions: [
      ...definitions,
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
              selectionSet: watchDefinition.selectionSet,
            },
          ]
        },
      }
    ],
  };
}

function getWatchDefinition(definitions: FragmentDefinitionNode[], fragmentName?: string): FragmentDefinitionNode {
  if (!fragmentName) {
    return definitions[0];
  }

  const fragmentDefinitionByName = definitions.find((def) => def.name.value === fragmentName);

  if (!fragmentDefinitionByName) {
    throw `No fragment with name: ${fragmentName}`;
  }

  return fragmentDefinitionByName;
}

// Returns a query that can be used to watch a normalized cache entity by converting the fragment to a query
// and dynamically adding a type policy that returns the entity.
export function buildWatchFragmentQuery(
  options: WatchFragmentOptions & {
    fieldName: string;
    policies: Policies,
  }
): DocumentNode {
  const { fragment, id, policies, fieldName, fragmentName } = options;
  const definitions = fragment.definitions as FragmentDefinitionNode[];
  const watchDefinition = getWatchDefinition(definitions, fragmentName);

  const query = _generateQueryFromFragment({
    definitions,
    watchDefinition,
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
  fieldName: string;
}): DocumentNode {
  const { fragment, filter, policies, cache, fieldName, fragmentName } = options;
  const definitions = fragment.definitions as FragmentDefinitionNode[];
  const watchDefinition = getWatchDefinition(definitions, fragmentName);
  const __typename = watchDefinition.typeCondition.name.value;

  const query = _generateQueryFromFragment({
    definitions,
    watchDefinition,
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
                filter,
              });
            }
          }
        }
      }
    });
  }

  return query;
}