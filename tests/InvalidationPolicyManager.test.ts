import InvalidationPolicyManager from "../src/policies/InvalidationPolicyManager";
import { EntityTypeMap } from "../src/entity-store";
import {
  InvalidationPolicies,
  PolicyActionCacheOperations,
  PolicyActionMeta,
  InvalidationPolicyEvent,
} from "../src/policies/types";
import { makeReference } from "@apollo/client";

describe("InvalidationPolicyManager", () => {
  let invalidationPolicyManager: InvalidationPolicyManager;
  let cacheOperations: PolicyActionCacheOperations;
  let entityTypeMap: EntityTypeMap;
  let policies: InvalidationPolicies;

  beforeEach(() => {
    policies = {};
    entityTypeMap = new EntityTypeMap();
    cacheOperations = {
      evict: jest.fn((..._args: any[]): any => {}),
      modify: jest.fn((..._args: any[]): any => {}),
      readField: jest.fn((..._args: any[]): any => {}),
    };
    invalidationPolicyManager = new InvalidationPolicyManager({
      entityTypeMap,
      policies,
      cacheOperations,
    });
  });

  describe("#runPolicyEvent", () => {
    let employeePolicyActionSpy: any;
    let employeesResponsePolicyActionSpy: any;
    let actionMeta: PolicyActionMeta;
    let mutedCacheOperations: PolicyActionCacheOperations;

    beforeEach(() => {
      actionMeta = {
        parent: {
          id: "ROOT_QUERY",
          fieldName: "createEmployee",
          storeFieldName: "createEmployees({new: true})",
          ref: makeReference("ROOT_QUERY"),
          variables: { new: true },
        },
      };
      employeePolicyActionSpy = jest.fn();
      employeesResponsePolicyActionSpy = jest.fn();
      policies = {
        types: {
          CreateEmployeeResponse: {
            onEvict: {
              Employee: (...args) => employeePolicyActionSpy(...args),
              EmployeesResponse: (...args) => employeesResponsePolicyActionSpy(...args),
            },
          },
        },
      };
      invalidationPolicyManager = new InvalidationPolicyManager({
        entityTypeMap,
        policies,
        cacheOperations,
      });
      mutedCacheOperations =
        // @ts-ignore
        invalidationPolicyManager.mutedCacheOperations;
      entityTypeMap.write("Employee", "Employee:1");
      entityTypeMap.write("Employee", "Employee:2");
      entityTypeMap.write(
        "EmployeesResponse",
        "ROOT_QUERY",
        "employees({country: 'US'})",
        { country: "US" }
      );
      entityTypeMap.write(
        "EmployeesResponse",
        "ROOT_QUERY",
        "employees({country: 'CAN'})",
        { country: "CAN" }
      );
    });

    test("should call the policy action handlers with the correct arguments", () => {
      invalidationPolicyManager.runEvictPolicy(
        "CreateEmployeeResponse",
        actionMeta
      );
      expect(employeePolicyActionSpy).toHaveBeenCalledTimes(2);
      expect(employeesResponsePolicyActionSpy).toHaveBeenCalledTimes(2);

      expect(employeePolicyActionSpy.mock.calls[0][0]).toEqual(
        // @ts-ignore
        invalidationPolicyManager.mutedCacheOperations
      );
      expect(employeePolicyActionSpy.mock.calls[0][1]).toEqual({
        id: "Employee:1",
        ref: makeReference("Employee:1"),
        storage: {},
        parent: actionMeta.parent,
      });

      expect(employeePolicyActionSpy.mock.calls[1][0]).toEqual(
        mutedCacheOperations
      );
      expect(employeePolicyActionSpy.mock.calls[1][1]).toEqual({
        id: "Employee:2",
        ref: makeReference("Employee:2"),
        storage: {},
        parent: actionMeta.parent,
      });

      expect(employeesResponsePolicyActionSpy.mock.calls[0][0]).toEqual(
        mutedCacheOperations
      );
      expect(employeesResponsePolicyActionSpy.mock.calls[0][1]).toEqual({
        id: "ROOT_QUERY",
        fieldName: "employees",
        storeFieldName: "employees({country: 'US'})",
        ref: makeReference("ROOT_QUERY"),
        variables: { country: "US" },
        storage: {},
        parent: actionMeta.parent,
      });

      expect(employeesResponsePolicyActionSpy.mock.calls[1][0]).toEqual(
        mutedCacheOperations
      );
      expect(employeesResponsePolicyActionSpy.mock.calls[1][1]).toEqual({
        id: "ROOT_QUERY",
        fieldName: "employees",
        ref: makeReference("ROOT_QUERY"),
        storeFieldName: "employees({country: 'CAN'})",
        variables: { country: "CAN" },
        storage: {},
        parent: actionMeta.parent,
      });
    });
  
    test('should persist storage per identifier across multiple policy events', () => {
      employeePolicyActionSpy = jest.fn((_cacheOperations, policyAction) => {
        policyAction.storage.count = (policyAction.storage?.count ?? 0) + 1;
      });
      invalidationPolicyManager.runEvictPolicy(
        "CreateEmployeeResponse",
        actionMeta
      );
      expect(employeePolicyActionSpy.mock.calls[0][1]).toEqual(
        {
          id: "Employee:1",
          ref: makeReference("Employee:1"),
          storage: { count: 1 },
          parent: actionMeta.parent,
        }
      );
      expect(employeePolicyActionSpy.mock.calls[1][1]).toEqual(
        {
          id: "Employee:2",
          ref: makeReference("Employee:2"),
          storage: { count: 1 },
          parent: actionMeta.parent,
        }
      );

      invalidationPolicyManager.runEvictPolicy(
        "CreateEmployeeResponse",
        actionMeta
      );

      expect(employeePolicyActionSpy.mock.calls[2][1]).toEqual(
        {
          id: "Employee:1",
          ref: makeReference("Employee:1"),
          storage: { count: 2 },
          parent: actionMeta.parent,
        }
      );
      expect(employeePolicyActionSpy.mock.calls[3][1]).toEqual(
        {
          id: "Employee:2",
          ref: makeReference("Employee:2"),
          storage: { count: 2 },
          parent: actionMeta.parent,
        }
      );
    });
  });

  describe("#activatePolicies", () => {
    test("should activate all policies with config options", () => {
      policies = {
        types: {
          Employee: {
            timeToLive: 5,
          },
          EmployeeResponse: {
            onWrite: {
              Employee: () => {},
            },
            onEvict: {
              Employee: () => {},
            },
          },
        },
      };
      invalidationPolicyManager = new InvalidationPolicyManager({
        entityTypeMap,
        policies,
        cacheOperations,
      });

      expect(
        invalidationPolicyManager.isPolicyActive(InvalidationPolicyEvent.Read)
      ).toEqual(true);
      expect(
        invalidationPolicyManager.isPolicyActive(InvalidationPolicyEvent.Write)
      ).toEqual(true);
      expect(
        invalidationPolicyManager.isPolicyActive(InvalidationPolicyEvent.Evict)
      ).toEqual(true);
    });

    test("should not activate policies without config options", () => {
      policies = {
        types: {
          Employee: {},
          EmployeeResponse: {},
        },
      };
      invalidationPolicyManager = new InvalidationPolicyManager({
        entityTypeMap,
        policies,
        cacheOperations,
      });

      expect(
        invalidationPolicyManager.isPolicyActive(InvalidationPolicyEvent.Read)
      ).toEqual(false);
      expect(
        invalidationPolicyManager.isPolicyActive(InvalidationPolicyEvent.Write)
      ).toEqual(false);
      expect(
        invalidationPolicyManager.isPolicyActive(InvalidationPolicyEvent.Evict)
      ).toEqual(false);
    });
  });
});
