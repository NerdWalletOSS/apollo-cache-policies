import "jest-extended";
import { InMemoryCache, StoreObject } from "@apollo/client/core";
import { EntityStoreWatcher, EntityTypeMap } from "../src/entity-store";
import { Policies } from "@apollo/client/cache/inmemory/policies";
import { EntityStore } from "@apollo/client/cache/inmemory/entityStore";
import { ReactiveVarsCache } from "../src/cache/ReactiveVarsCache";
import { InvalidationPolicyCache } from "../src";

describe("#EntityStoreWatcher", () => {
  let entityStoreWatcher: EntityStoreWatcher;
  let entityTypeMap: EntityTypeMap;
  let entityStore: EntityStore;
  let policies: Policies;
  let reactiveVarsCache: ReactiveVarsCache;
  let dateNowSpy: any;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
    policies = new Policies({ cache: new InMemoryCache() });
    entityTypeMap = new EntityTypeMap();
    entityStore = new EntityStore.Root({
      policies,
    });
    reactiveVarsCache = new ReactiveVarsCache({
      cache: new InvalidationPolicyCache(),
    });
    entityStoreWatcher = new EntityStoreWatcher({
      policies,
      entityTypeMap,
      entityStore,
      reactiveVarsCache,
      updateCollectionField: () => { }
    });
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  describe("#merge", () => {
    let entityTypeMapSpy: any;

    beforeEach(() => {
      entityTypeMapSpy = jest.spyOn(entityTypeMap, "write");
    });

    afterEach(() => {
      entityTypeMapSpy.mockRestore();
    });

    test("should call the entityStore merge", () => {
      const mergeSpy = jest.spyOn(entityStore, "merge");
      entityStoreWatcher = new EntityStoreWatcher({
        policies,
        entityTypeMap,
        entityStore,
        reactiveVarsCache,
        updateCollectionField: () => { }
      });
      const mergeArgs: [string, StoreObject] = [
        "ROOT_QUERY",
        {
          employees: {
            __typename: "EmployeesResponse",
          },
        },
      ];
      entityStore.merge(...mergeArgs);
      expect(mergeSpy).toHaveBeenCalledWith(...mergeArgs);
      mergeSpy.mockRestore();
    });

    describe("with a query entity", () => {
      test("should call the entityTypeMap write", () => {
        // @ts-ignore
        entityStoreWatcher.merge("ROOT_QUERY", {
          employees: {
            __typename: "EmployeesResponse",
          },
        });
        expect(entityTypeMapSpy).toHaveBeenCalledWith(
          "EmployeesResponse",
          "ROOT_QUERY",
          "employees"
        );
      });
    });

    describe("with a normalized cache entity", () => {
      test("should call the entityTypeMap write", () => {
        entityStore.merge("Employee:1", {
          __typename: "Employee",
          id: 1,
        });
        expect(entityTypeMapSpy).toHaveBeenCalledWith("Employee", "Employee:1");
      });
    });
  });

  describe("#delete", () => {
    let entityTypeMapSpy: any;

    beforeEach(() => {
      entityTypeMapSpy = jest.spyOn(entityTypeMap, "evict");
    });

    afterEach(() => {
      entityTypeMapSpy.mockRestore();
    });

    test("should call the entityStore delete", () => {
      const deleteSpy = jest.spyOn(entityStore, "delete");
      entityStoreWatcher = new EntityStoreWatcher({
        policies,
        entityTypeMap,
        entityStore,
        reactiveVarsCache,
        updateCollectionField: () => { }
      });
      entityStore.delete("ROOT_QUERY", "employees", undefined);
      expect(deleteSpy).toHaveBeenCalledWith(
        "ROOT_QUERY",
        "employees",
        undefined
      );
      deleteSpy.mockRestore();
    });

    describe("with a query entity", () => {
      describe("without variables", () => {
        test("should call the entityTypeMap evict", () => {
          entityStore.delete("ROOT_QUERY", "employees");
          expect(entityTypeMapSpy).toHaveBeenCalledWith(
            "ROOT_QUERY",
            "employees"
          );
        });
      });

      describe("with variables", () => {
        test("should call the entityTypeMap evict", () => {
          entityStore.delete("ROOT_QUERY", "employees", {
            name: "Test",
          });
          // prettier-ignore
          expect(entityTypeMapSpy).toHaveBeenCalledWith("ROOT_QUERY", "employees({\"name\":\"Test\"})");
        });
      });
    });

    describe("with a normalized cache entity", () => {
      test("should call the entityTypeMap evict", () => {
        entityStore.delete("Employee:1");
        expect(entityTypeMapSpy).toHaveBeenCalledWith("Employee:1", undefined);
      });
    });
  });

  describe("#clear", () => {
    test("should call the entityStore clear", () => {
      const clearSpy = jest.spyOn(entityStore, "clear");
      entityStoreWatcher = new EntityStoreWatcher({
        policies,
        entityTypeMap,
        entityStore,
        reactiveVarsCache,
        updateCollectionField: () => { }
      });
      entityStore.clear();
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });

    test("should call the entityTypeMap clear", () => {
      const clearSpy = jest.spyOn(entityTypeMap, "clear");
      entityStore.clear();
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });

  describe("#replace", () => {
    let replaceSpy: any;

    beforeEach(() => {
      replaceSpy = jest.spyOn(entityStore, "replace");
      entityStoreWatcher = new EntityStoreWatcher({
        policies,
        entityTypeMap,
        entityStore,
        reactiveVarsCache,
        updateCollectionField: () => { }
      });
    });

    afterEach(() => {
      replaceSpy.mockRestore();
    });

    test("should call entityStore replace without invalidation data", () => {
      // @ts-ignore
      entityStore.replace({
        invalidation: {
          entitiesById: {},
        },
      });

      expect(replaceSpy).toHaveBeenCalledWith({});
    });

    test("should pause the entityStoreWatcher before calling entityStore replace and then resume", () => {
      // @ts-ignore
      let pauseSpy = jest.spyOn(entityStoreWatcher, "pause");
      // @ts-ignore
      let watchSpy = jest.spyOn(entityStoreWatcher, "watch");
      // @ts-ignore
      entityStore.replace({
        invalidation: {
          entitiesById: {},
        },
      });
      expect(pauseSpy).toHaveBeenCalledBefore(replaceSpy);
      expect(watchSpy).toHaveBeenCalledAfter(replaceSpy);
    });
  });

  describe("#pause and #watch", () => {
    test("should pause entity store proxies and resume them", () => {
      const entityStoreMergeSpy = jest
        .spyOn(entityStore, "merge")
        .mockImplementation();
      const entityStoreDeleteSpy = jest
        .spyOn(entityStore, "delete")
        .mockImplementation();
      const entityStoreClearSpy = jest
        .spyOn(entityStore, "clear")
        .mockImplementation();
      const entityStoreReplaceSpy = jest
        .spyOn(entityStore, "replace")
        .mockImplementation();
      entityStoreWatcher = new EntityStoreWatcher({
        policies,
        entityTypeMap,
        entityStore,
        reactiveVarsCache,
        updateCollectionField: () => {},
      });
      const entityStoreWatcherMergeSpy = jest
        // @ts-ignore
        .spyOn(entityStoreWatcher, "merge")
        // @ts-ignore
        .mockImplementation();
      const entityStoreWatcherDeleteSpy = jest
        // @ts-ignore
        .spyOn(entityStoreWatcher, "delete")
        // @ts-ignore
        .mockImplementation();
      const entityStoreWatcherClearSpy = jest
        // @ts-ignore
        .spyOn(entityStoreWatcher, "clear")
        // @ts-ignore
        .mockImplementation();
      const entityStoreWatcherReplaceSpy = jest
        // @ts-ignore
        .spyOn(entityStoreWatcher, "replace")
        // @ts-ignore
        .mockImplementation();

      // @ts-ignore
      entityStoreWatcher.pause();
      entityStore.merge("test", {});
      entityStore.delete("test");
      entityStore.clear();
      entityStore.replace({});
      expect(entityStoreMergeSpy).toHaveBeenCalled();
      expect(entityStoreDeleteSpy).toHaveBeenCalled();
      expect(entityStoreClearSpy).toHaveBeenCalled();
      expect(entityStoreReplaceSpy).toHaveBeenCalled();

      expect(entityStoreWatcherMergeSpy).not.toHaveBeenCalled();
      expect(entityStoreWatcherDeleteSpy).not.toHaveBeenCalled();
      expect(entityStoreWatcherClearSpy).not.toHaveBeenCalled();
      expect(entityStoreWatcherReplaceSpy).not.toHaveBeenCalled();

      // @ts-ignore
      entityStoreWatcher.watch();
      entityStore.merge("test", {});
      entityStore.delete("test");
      entityStore.clear();
      entityStore.replace({});

      expect(entityStoreWatcherMergeSpy).toHaveBeenCalled();
      expect(entityStoreWatcherDeleteSpy).toHaveBeenCalled();
      expect(entityStoreWatcherClearSpy).toHaveBeenCalled();
      expect(entityStoreWatcherReplaceSpy).toHaveBeenCalled();
    });
  });
});
