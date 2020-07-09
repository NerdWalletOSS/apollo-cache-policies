import _ from "lodash";
import { EntityTypeMap } from "../src/entity-store";

describe("EntityTypeMap", () => {
  let entityTypeMap: EntityTypeMap;
  let dateNowSpy: any;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
    entityTypeMap = new EntityTypeMap();
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  describe("#extract", () => {
    test("should return the entity type map entities by ID", () => {
      entityTypeMap = new EntityTypeMap();
      entityTypeMap.write("Employee", "Employee:1");
      entityTypeMap.write("EmployeesResponse", "ROOT_QUERY", "employees");

      expect(entityTypeMap.extract()).toEqual({
        entitiesById: {
          "Employee:1": {
            dataId: "Employee:1",
            typename: "Employee",
            cacheTime: 0,
          },
          "ROOT_QUERY.employees": {
            dataId: "ROOT_QUERY",
            fieldName: "employees",
            typename: "EmployeesResponse",
            storeFieldNames: {
              __size: 1,
              entries: {
                employees: {
                  cacheTime: 0,
                },
              },
            },
          },
        },
        entitiesByType: {
          Employee: {
            "Employee:1": {
              dataId: "Employee:1",
              typename: "Employee",
              cacheTime: 0,
            },
          },
          EmployeesResponse: {
            "ROOT_QUERY.employees": {
              dataId: "ROOT_QUERY",
              fieldName: "employees",
              typename: "EmployeesResponse",
              storeFieldNames: {
                __size: 1,
                entries: {
                  employees: {
                    cacheTime: 0,
                  },
                },
              },
            },
          },
        },
      });
    });
  });

  describe("#restore", () => {
    test("should restore the entities by type and entities by id", () => {
      entityTypeMap.write("Employee", "Employee:1");
      entityTypeMap.write("EmployeesResponse", "ROOT_QUERY", "employees");
      const extractedEntityTypeMap = entityTypeMap.extract();
      entityTypeMap.clear();
      entityTypeMap.restore(extractedEntityTypeMap.entitiesById);
      expect(entityTypeMap.extract()).toEqual({
        entitiesById: {
          "Employee:1": {
            dataId: "Employee:1",
            typename: "Employee",
            cacheTime: 0,
          },
          "ROOT_QUERY.employees": {
            dataId: "ROOT_QUERY",
            fieldName: "employees",
            typename: "EmployeesResponse",
            storeFieldNames: {
              __size: 1,
              entries: {
                employees: {
                  cacheTime: 0,
                },
              },
            },
          },
        },
        entitiesByType: {
          Employee: {
            "Employee:1": {
              dataId: "Employee:1",
              typename: "Employee",
              cacheTime: 0,
            },
          },
          EmployeesResponse: {
            "ROOT_QUERY.employees": {
              dataId: "ROOT_QUERY",
              fieldName: "employees",
              typename: "EmployeesResponse",
              storeFieldNames: {
                __size: 1,
                entries: {
                  employees: {
                    cacheTime: 0,
                  },
                },
              },
            },
          },
        },
      });
    });
  });

  describe("#write", () => {
    describe("with a query entity", () => {
      describe("with a field name", () => {
        test("should add the entity to to the type map by field name", () => {
          entityTypeMap.write("EmployeesResponse", "ROOT_QUERY", "employees");
          expect(entityTypeMap.extract()).toEqual({
            entitiesById: {
              "ROOT_QUERY.employees": {
                dataId: "ROOT_QUERY",
                fieldName: "employees",
                typename: "EmployeesResponse",
                storeFieldNames: {
                  __size: 1,
                  entries: {
                    employees: {
                      cacheTime: 0,
                    },
                  },
                },
              },
            },
            entitiesByType: {
              EmployeesResponse: {
                "ROOT_QUERY.employees": {
                  dataId: "ROOT_QUERY",
                  fieldName: "employees",
                  typename: "EmployeesResponse",
                  storeFieldNames: {
                    __size: 1,
                    entries: {
                      employees: {
                        cacheTime: 0,
                      },
                    },
                  },
                },
              },
            },
          });
        });
      });

      describe("with a store field name", () => {
        test("should add the entity to to the type map by store field name", () => {
          // prettier-ignore
          entityTypeMap.write("EmployeesResponse", "ROOT_QUERY", "employees({\"name\":\"Test\"})");
          expect(entityTypeMap.extract()).toEqual({
            entitiesById: {
              "ROOT_QUERY.employees": {
                dataId: "ROOT_QUERY",
                fieldName: "employees",
                typename: "EmployeesResponse",
                storeFieldNames: {
                  __size: 1,
                  entries: {
                    // prettier-ignore
                    "employees({\"name\":\"Test\"})": {
                      cacheTime: 0,
                    }
                  },
                },
              },
            },
            entitiesByType: {
              EmployeesResponse: {
                "ROOT_QUERY.employees": {
                  dataId: "ROOT_QUERY",
                  fieldName: "employees",
                  typename: "EmployeesResponse",
                  storeFieldNames: {
                    __size: 1,
                    entries: {
                      // prettier-ignore
                      "employees({\"name\":\"Test\"})": {
                        cacheTime: 0,
                      }
                    },
                  },
                },
              },
            },
          });
        });
      });
    });

    test("with a normalized data entity", () => {
      entityTypeMap.write("Employee", "Employee:1");
      expect(entityTypeMap.extract()).toEqual({
        entitiesById: {
          "Employee:1": {
            dataId: "Employee:1",
            cacheTime: 0,
            typename: "Employee",
          },
        },
        entitiesByType: {
          Employee: {
            "Employee:1": {
              dataId: "Employee:1",
              cacheTime: 0,
              typename: "Employee",
            },
          },
        },
      });
    });
  });

  describe("#evict", () => {
    describe("with a query entity", () => {
      describe("without variables", () => {
        test("should evict the query entity from the type map", () => {
          entityTypeMap.write("EmployeesResponse", "ROOT_QUERY", "employees");
          entityTypeMap.evict("ROOT_QUERY", "employees");
          expect(entityTypeMap.extract()).toEqual({
            entitiesById: {},
            entitiesByType: {
              EmployeesResponse: {},
            },
          });
        });
      });

      describe("with variables", () => {
        test("should evict the query entity from the type map", () => {
          // prettier-ignore
          entityTypeMap.write("EmployeesResponse", "ROOT_QUERY", "employees({\"name\":\"Test\"})");
          // prettier-ignore
          entityTypeMap.evict("ROOT_QUERY", "employees({\"name\":\"Test\"})");
          expect(entityTypeMap.extract()).toEqual({
            entitiesById: {},
            entitiesByType: {
              EmployeesResponse: {},
            },
          });
        });
      });
    });

    describe("with a normalized data entity", () => {
      test("should evict the entity from the type map", () => {
        entityTypeMap.write("Employee", "Employee:1");
        entityTypeMap.evict("Employee:1");
        expect(entityTypeMap.extract()).toEqual({
          entitiesById: {},
          entitiesByType: {
            Employee: {},
          },
        });
      });
    });
  });

  describe("#clear", () => {
    let entityTypeMap: EntityTypeMap;
    let dateNowSpy: any;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
      entityTypeMap = new EntityTypeMap();
      entityTypeMap.write("Employee", "Employee:1");
      entityTypeMap.write("EmployeesResponse", "ROOT_QUERY", "employees");
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
    });

    test("should clear out the entity type map", () => {
      entityTypeMap.clear();
      expect(entityTypeMap.extract()).toEqual({
        entitiesById: {},
        entitiesByType: {},
      });
    });
  });
});
