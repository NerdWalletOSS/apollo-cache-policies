import { DocumentNode, FragmentDefinitionNode } from 'graphql';
import { WatchFragmentOptions, WatchFragmentWhereOptions } from './types';
import { InvalidationPolicyCache } from '../cache';
import { Policies } from '@apollo/client/cache/inmemory/policies';
import { makeReference } from '@apollo/client/core';
// import { collectionEntityIdForType } from '../cache/utils';

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

export function buildWatchFragmentQuery(
  options: WatchFragmentOptions & {
    policies: Policies,
  }
): DocumentNode {
  const { fragment, id, policies } = options;
  const fragmentDefinition = fragment.definitions[0] as FragmentDefinitionNode;
  const fragmentName = fragmentDefinition.name.value;

  const query = _generateQueryFromFragment({
    fragmentDefinition: fragmentDefinition,
    fieldName: fragmentName,
  });

  // @ts-ignore
  if (!policies.getFieldPolicy('Query', fragmentName)) {
    policies.addTypePolicies({
      Query: {
        fields: {
          [fragmentName]: {
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

export function buildWatchFragmentWhereQuery<FragmentType>(options: WatchFragmentWhereOptions<FragmentType> & {
  cache: InvalidationPolicyCache,
  policies: Policies,
}): DocumentNode {
  const { fragment, filters, policies, cache } = options;
  const fragmentDefinition = fragment.definitions[0] as FragmentDefinitionNode;
  const fragmentName = fragmentDefinition.name.value;
  const __typename = fragmentDefinition.typeCondition.name.value;

  const query = _generateQueryFromFragment({
    fragmentDefinition,
    fieldName: fragmentName,
  });

  // @ts-ignore
  if (!policies.getFieldPolicy('Query', fragmentName)) {
    policies.addTypePolicies({
      Query: {
        fields: {
          [fragmentName]: {
            read(_existing) {
              return cache.readReferenceWhere({
                __typename,
                ...filters,
              });
            }
          }
        }
      }
    });
  }

  return query;
}