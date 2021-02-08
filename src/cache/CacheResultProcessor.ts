import _ from "lodash";
import { FieldNode, SelectionNode } from "graphql";
import { Cache, makeReference } from "@apollo/client";
import {
  createFragmentMap,
  getFragmentDefinitions,
  getFragmentFromSelection,
  getOperationDefinition,
  isField,
  maybeDeepFreeze,
  resultKeyNameFromField,
} from "@apollo/client/utilities";
import { CacheResultProcessorConfig } from "./types";
import { makeEntityId, isQuery } from "../helpers";
import { RenewalPolicy } from "../policies/types";

export enum ReadResultStatus {
  Evicted,
  Incomplete,
  Complete,
}

/**
 * Processes the result of a cache read/write to run invalidation policies on the deeply nested objects.
 */
export class CacheResultProcessor {
  constructor(private config: CacheResultProcessorConfig) { }

  private getFieldsForQuery(
    options: Cache.ReadOptions<any> | Cache.WriteOptions<any, any>
  ) {
    const operationDefinition = getOperationDefinition(options.query);
    const fragmentMap = createFragmentMap(
      getFragmentDefinitions(options.query)
    );

    return operationDefinition!.selectionSet.selections.reduce<SelectionNode[]>(
      (acc, selection) => {
        if (isField(selection)) {
          acc.push(selection);
          return acc;
        }

        const selections = getFragmentFromSelection(selection, fragmentMap)
          ?.selectionSet?.selections;

        if (selections) {
          acc.push(...selections);
        }

        return acc;
      },
      []
    ) as FieldNode[];
  }

  private processReadSubResult(
    parentResult: any,
    fieldNameOrIndex?: string | number
  ): ReadResultStatus {
    const { cache, invalidationPolicyManager, entityTypeMap } = this.config;

    const result = _.isUndefined(fieldNameOrIndex)
      ? parentResult
      : parentResult[fieldNameOrIndex];

    if (_.isPlainObject(result)) {
      const { __typename } = result;

      const aggregateResultComplete = Object.keys(result).reduce(
        (_acc, fieldName) =>
          this.processReadSubResult(result, fieldName) ===
          ReadResultStatus.Complete,
        true
      );

      if (__typename) {
        const id = cache.identify(result);
        if (id) {
          const renewalPolicy = invalidationPolicyManager.getRenewalPolicyForType(
            __typename
          );
          if (
            renewalPolicy === RenewalPolicy.AccessAndWrite ||
            renewalPolicy === RenewalPolicy.AccessOnly
          ) {
            entityTypeMap.renewEntity(id);
          }
          const evicted = invalidationPolicyManager.runReadPolicy({
            typename: __typename,
            dataId: id
          });

          if (evicted) {
            if (_.isPlainObject(parentResult) && fieldNameOrIndex) {
              delete parentResult[fieldNameOrIndex];
            }
            return ReadResultStatus.Evicted;
          }
        }
      }

      return aggregateResultComplete
        ? ReadResultStatus.Complete
        : ReadResultStatus.Incomplete;
    } else if (_.isArray(result)) {
      let aggregateSubResultStatus = ReadResultStatus.Complete as ReadResultStatus;

      const subResultStatuses = result.map((_subResult, index) => {
        const subResultStatus = this.processReadSubResult(result, index);
        if (subResultStatus < aggregateSubResultStatus) {
          aggregateSubResultStatus = subResultStatus;
        }
        return subResultStatus;
      });

      if (
        aggregateSubResultStatus === ReadResultStatus.Evicted &&
        fieldNameOrIndex
      ) {
        parentResult[fieldNameOrIndex] = result.filter(
          (_subResult, index) =>
            subResultStatuses[index] !== ReadResultStatus.Evicted
        );
      }

      return aggregateSubResultStatus === ReadResultStatus.Complete
        ? ReadResultStatus.Complete
        : ReadResultStatus.Incomplete;
    }

    return ReadResultStatus.Complete;
  }

  processReadResult<T>(
    result: T,
    options: Cache.ReadOptions<any>
  ): ReadResultStatus {
    const { cache, entityTypeMap, invalidationPolicyManager } = this.config;
    const { rootId: dataId = "ROOT_QUERY" } = options;

    if (_.isPlainObject(result)) {
      if (isQuery(dataId)) {
        const { variables } = options;

        const aggregateResultComplete = this.getFieldsForQuery(options).reduce<
          boolean
        >((acc, field) => {
          const fieldName = resultKeyNameFromField(field);
          const subResultStatus = this.processReadSubResult(result, fieldName);

          const typename = entityTypeMap.readEntityById(
            makeEntityId(dataId, fieldName)
          )?.typename;

          if (typename) {
            const storeFieldName = cache.policies.getStoreFieldName({
              typename,
              fieldName,
              field,
              variables,
            });
            const renewalPolicy = invalidationPolicyManager.getRenewalPolicyForType(
              typename
            );
            if (
              renewalPolicy === RenewalPolicy.AccessAndWrite ||
              renewalPolicy === RenewalPolicy.AccessOnly
            ) {
              entityTypeMap.renewEntity(dataId, storeFieldName);
            }
            const evicted = invalidationPolicyManager.runReadPolicy({
              typename,
              dataId,
              fieldName,
              storeFieldName
            });

            if (evicted) {
              delete (result as Record<string, any>)[fieldName];
              return false;
            }
          }

          return acc && subResultStatus === ReadResultStatus.Complete;
        }, true);

        maybeDeepFreeze(result);

        return aggregateResultComplete
          ? ReadResultStatus.Complete
          : ReadResultStatus.Incomplete;
      }

      maybeDeepFreeze(result);
      return this.processReadSubResult(result);
    }

    return ReadResultStatus.Complete;
  }

  private processWriteSubResult(result: any) {
    const { cache, invalidationPolicyManager, entityTypeMap } = this.config;
    if (_.isPlainObject(result)) {
      const { __typename } = result;

      Object.keys(result).forEach((resultField) =>
        this.processWriteSubResult(result[resultField])
      );

      if (__typename) {
        const id = cache.identify(result);

        if (id) {
          const renewalPolicy = invalidationPolicyManager.getRenewalPolicyForType(
            __typename
          );
          if (
            renewalPolicy === RenewalPolicy.WriteOnly ||
            renewalPolicy === RenewalPolicy.AccessAndWrite
          ) {
            entityTypeMap.renewEntity(id);
          }

          invalidationPolicyManager.runWritePolicy(__typename, {
            parent: {
              id,
              ref: makeReference(id),
            },
          });
        }
      }
    } else if (_.isArray(result)) {
      result.forEach((resultListItem) =>
        this.processWriteSubResult(resultListItem)
      );
    }
  }

  processWriteResult(options: Cache.WriteOptions<any, any>) {
    const { dataId, variables, result } = options;
    const { entityTypeMap, cache, invalidationPolicyManager } = this.config;

    if (_.isPlainObject(result)) {
      this.processWriteSubResult(result);
    }

    if (dataId && isQuery(dataId) && _.isPlainObject(result)) {
      this.getFieldsForQuery(options).forEach((field) => {
        const fieldName = resultKeyNameFromField(field);
        const typename = entityTypeMap.readEntityById(
          makeEntityId(dataId, fieldName)
        )?.typename;

        if (typename) {
          const storeFieldName = cache.policies.getStoreFieldName({
            typename,
            field,
            fieldName,
            variables,
          });

          const hasFieldArgs = (field?.arguments?.length ?? 0) > 0;
          const fieldVariables = variables ?? (hasFieldArgs ? {} : undefined);

          // Write a query to the entity type map at `write` in addition to `merge` time so that we can keep track of its variables.
          entityTypeMap.write(typename, dataId, storeFieldName, fieldVariables);

          const renewalPolicy = invalidationPolicyManager.getRenewalPolicyForType(
            typename
          );
          if (
            renewalPolicy === RenewalPolicy.WriteOnly ||
            renewalPolicy === RenewalPolicy.AccessAndWrite
          ) {
            entityTypeMap.renewEntity(dataId, storeFieldName);
          }

          invalidationPolicyManager.runWritePolicy(typename, {
            parent: {
              id: dataId,
              fieldName,
              storeFieldName,
              ref: makeReference(dataId),
              variables: fieldVariables,
            },
          });
        }
      });
    } else if (dataId) {
      const typename = entityTypeMap.readEntityById(makeEntityId(dataId))
        ?.typename;

      if (typename) {
        const renewalPolicy = invalidationPolicyManager.getRenewalPolicyForType(
          typename
        );
        if (
          renewalPolicy === RenewalPolicy.WriteOnly ||
          renewalPolicy === RenewalPolicy.AccessAndWrite
        ) {
          entityTypeMap.renewEntity(dataId);
        }

        invalidationPolicyManager.runWritePolicy(typename, {
          parent: {
            id: dataId,
            ref: makeReference(dataId),
            variables,
          },
        });
      }
    }
  }
}
