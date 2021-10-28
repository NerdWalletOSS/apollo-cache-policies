import _ from "lodash";
import { gql } from "@apollo/client/core";
import { InvalidationPolicyCache } from "../src";
import Employee, { EmployeeType } from "./fixtures/employee";
import EmployeeMessage from "./fixtures/employeeMessage";
import { InvalidationPolicyEvent, RenewalPolicy } from "../src/policies/types";

describe("Cache", () => {
  let cache: InvalidationPolicyCache;

  const [employee, employee2, employee3] = _.times(3, () => Employee());
  const [employeeMessage, employeeMessage2] = [
    EmployeeMessage({ employee_id: employee.id }),
    EmployeeMessage({ employee_id: employee2.id }),
  ];

  const employeesQuery = gql`
    query {
      employees {
        data {
          id
          employee_name
          employee_salary
          employee_age
        }
      }
    }
  `;

  const employeeMessagesQuery = gql`
    query employeeMessages {
      employeeMessages {
        data {
          id
          employee_id
          employee_message
        }
      }
    }
  `;

  const employeesAndMessagesQuery = gql`
    query employeesAndMessages {
      employees {
        data {
          id
          employee_name
          employee_salary
          employee_age
        }
      }
      employeeMessages {
        data {
          id
          employee_id
          employee_message
        }
      }
    }
  `;

  const employeesLocalQuery = gql`
    query employeesLocal {
      employees {
        data {
          id
          employee_name
          employee_salary
          employee_age
          employee_location @client
        }
      }
    }
  `;

  const employeesWithVariablesQuery = gql`
    query {
      employees(name: $name) {
        data {
          id
          employee_name
          employee_salary
          employee_age
        }
      }
    }
  `;

  const createEmployeeMutation = gql`
    query {
      createEmployee {
        data {
          id
          employee_name
          employee_salary
          employee_age
        }
      }
    }
  `;

  const createEmployeeMutationWithVariables = gql`
    query {
      createEmployee(name: $name) {
        data {
          id
          employee_name
          employee_salary
          employee_age
        }
      }
    }
  `;

  const deleteEmployeesMutation = gql`
    mutation {
      deleteEmployees {
        data {
          success
        }
      }
    }
  `;

  const employeesResponse = {
    employees: {
      __typename: "EmployeesResponse",
      data: [employee, employee2],
    },
  };

  const employeeMessagesResponse = {
    employeeMessages: {
      __typename: "EmployeeMessagesResponse",
      data: [employeeMessage, employeeMessage2],
    },
  };

  const employeesAndMessagesResponse = {
    ...employeesResponse,
    ...employeeMessagesResponse,
  };

  const employeesLocalResponse = {
    employees: {
      __typename: "EmployeesResponse",
      data: [
        {
          ...employee,
          employee_location: "US",
        },
        {
          ...employee2,
          employee_location: "CAN",
        },
      ],
    },
  };

  const createEmployeeResponse = {
    createEmployee: {
      __typename: "CreateEmployeeResponse",
      data: employee3,
    },
  };

  const deleteEmployeesResponse = {
    deleteEmployees: {
      __typename: "DeleteEmployeesResponse",
      data: { success: true },
    },
  };

  const deleteEmployeesResponseFailed = {
    deleteEmployees: {
      __typename: "DeleteEmployeesResponse",
      data: { success: false },
    },
  };

  describe('with collections enabled', () => {
    beforeEach(() => {
      cache = new InvalidationPolicyCache({
        enableCollections: true,
      });
      cache.writeQuery({
        query: employeesQuery,
        data: employeesResponse,
      });
    });

    test('should record refs under the correct collection entity by type', () => {
      expect(cache.extract(true, false)).toEqual({
        "CacheExtensionsCollectionEntity:Employee": {
          __typename: 'CacheExtensionsCollectionEntity',
          id: 'Employee',
          data: [
            { __ref: employee.toRef() }, { __ref: employee2.toRef() }
          ],
        },
        [employee.toRef()]: employee,
        [employee2.toRef()]: employee2,
        ROOT_QUERY: {
          __typename: "Query",
          employees: {
            __typename: "EmployeesResponse",
            data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
          },
        },
        __META: {
          extraRootIds: [
            'CacheExtensionsCollectionEntity:Employee'
          ]
        }
      });
    });

    describe('readFragmentWhere', () => {
      describe('with an object filter', () => {
        test('should return matching entities', () => {
          const employeeFragment = gql`
            fragment employee on Employee {
              id
              employee_name
              employee_age
              employee_salary
            }
          `;

          const matchingEntities = cache.readFragmentWhere<EmployeeType>({
            fragment: employeeFragment,
            filter: {
              employee_name: employee.employee_name,
              employee_salary: employee.employee_salary,
            },
          });

          expect(matchingEntities).toEqual([employee]);
        });
      });

      describe('with a function filter', () => {
        test('should return matching entities', () => {
          const employeeFragment = gql`
            fragment employee on Employee {
              id
              employee_name
              employee_age
              employee_salary
            }
          `;


          const matchingEntities = cache.readFragmentWhere<EmployeeType>({
            fragment: employeeFragment,
            filter: (ref, readField) => readField('employee_name', ref) === employee.employee_name,
          });

          expect(matchingEntities).toEqual([employee]);
        });
      });

      describe('with no filter', () => {
        test('should return all entities of the given type', () => {
          const employeeFragment = gql`
            fragment employee on Employee {
              id
              employee_name
              employee_age
              employee_salary
            }
          `;

          const matchingEntities = cache.readFragmentWhere<EmployeeType>({
            fragment: employeeFragment,
          });

          expect(matchingEntities).toEqual([employee, employee2]);
        });
      });
    });
  });


  describe("with an Evict-on-Write cache policy", () => {
    beforeEach(() => {
      cache = new InvalidationPolicyCache({
        invalidationPolicies: {
          types: {
            DeleteEmployeesResponse: {
              onWrite: {
                Employee: ({ evict }, { id, fieldName }) =>
                  evict({ id, fieldName }),
              },
            },
          },
        },
      });
      cache.writeQuery({
        query: employeesQuery,
        data: employeesResponse,
      });
    });

    test("should evict the child entities on parent write", () => {
      expect(cache.extract(true, false)).toEqual({
        [employee.toRef()]: employee,
        [employee2.toRef()]: employee2,
        ROOT_QUERY: {
          __typename: "Query",
          employees: {
            __typename: "EmployeesResponse",
            data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
          },
        },
      });
      cache.writeQuery({
        query: deleteEmployeesMutation,
        data: deleteEmployeesResponse,
      });
      expect(cache.extract(true, false)).toEqual({
        ROOT_QUERY: {
          __typename: "Query",
          deleteEmployees: {
            __typename: "DeleteEmployeesResponse",
            data: { success: true },
          },
          employees: {
            __typename: "EmployeesResponse",
            data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
          },
        },
      });
    });

    test("should broadcast watches once after running all policies", () => {
      // @ts-ignore
      const broadcastWatchesSpy = jest.spyOn(cache, "broadcastWatches");
      cache.writeQuery({
        query: deleteEmployeesMutation,
        data: deleteEmployeesResponse,
      });
      expect(broadcastWatchesSpy).toHaveBeenCalledTimes(1);
      broadcastWatchesSpy.mockRestore();
    });

    describe("with a conditional Evict-on-Write cache policy", () => {
      beforeEach(() => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            types: {
              DeleteEmployeesResponse: {
                onWrite: {
                  Employee: (
                    { evict, readField },
                    { id, ref, parent: { variables } }
                  ) => {
                    if (variables?.deleteEmployeeId === readField("id", ref)) {
                      evict({ id });
                    }
                  },
                },
              },
            },
          },
        });
        cache.writeQuery({
          query: employeesQuery,
          data: employeesResponse,
        });
      });

      test("should evict the matching child entity", () => {
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
          },
        });
        cache.writeQuery({
          query: deleteEmployeesMutation,
          data: deleteEmployeesResponse,
          variables: {
            deleteEmployeeId: employee.id,
          },
        });
        expect(cache.extract(true, false)).toEqual({
          [employee2.toRef()]: employee2,
          ROOT_QUERY: {
            __typename: "Query",
            deleteEmployees: {
              __typename: "DeleteEmployeesResponse",
              data: { success: true },
            },
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
          },
        });
      });
    });

    describe("while operating on an optimistic layer", () => {
      test("should not trigger write policies", () => {
        cache.recordOptimisticTransaction((proxy) => {
          proxy.writeQuery({
            query: deleteEmployeesMutation,
            data: deleteEmployeesResponse,
          });
        }, "delete employee");
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            deleteEmployees: {
              __typename: "DeleteEmployeesResponse",
              data: { success: true },
            },
          },
        });
      });
    });

    describe("with a query containing local fields", () => {
      beforeEach(() => {
        cache.writeQuery({
          query: employeesLocalQuery,
          data: employeesLocalResponse,
        });
      });

      test("should evict the child entities", () => {
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: {
            ...employee,
            employee_location: "US",
          },
          [employee2.toRef()]: {
            ...employee2,
            employee_location: "CAN",
          },
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
          },
        });
        cache.writeQuery({
          query: deleteEmployeesMutation,
          data: deleteEmployeesResponse,
        });
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            deleteEmployees: {
              __typename: "DeleteEmployeesResponse",
              data: { success: true },
            },
          },
        });
      });
    });
  });

  describe("with a cascading Evict-on-Write cache policy", () => {
    beforeEach(() => {
      cache = new InvalidationPolicyCache({
        invalidationPolicies: {
          types: {
            DeleteEmployeesResponse: {
              onWrite: {
                EmployeesResponse: ({ evict }, { id, fieldName }) =>
                  evict({ id, fieldName }),
              },
            },
            EmployeesResponse: {
              onEvict: {
                Employee: ({ evict }, { id, fieldName }) =>
                  evict({ id, fieldName }),
              },
            },
          },
        },
      });
      cache.writeQuery({
        query: employeesQuery,
        data: employeesResponse,
      });
      cache.writeQuery({
        query: employeesWithVariablesQuery,
        data: employeesResponse,
        variables: {
          name: "Test",
        },
      });
    });

    test("should evict cascaded child entities", () => {
      cache.writeQuery({
        query: deleteEmployeesMutation,
        data: deleteEmployeesResponse,
      });
      expect(cache.extract(true, false)).toEqual({
        ROOT_QUERY: {
          __typename: "Query",
          deleteEmployees: {
            __typename: "DeleteEmployeesResponse",
            data: { success: true },
          },
        },
      });
    });

    describe("with a conditional cascading Evict-on-Write policy", () => {
      beforeEach(() => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            types: {
              DeleteEmployeesResponse: {
                onWrite: {
                  Employee: (
                    { readField, evict },
                    { ref, id, parent: { variables } }
                  ) => {
                    if (variables?.deleteEmployeeId === readField("id", ref)) {
                      evict({ id });
                    }
                  },
                },
              },
              Employee: {
                onEvict: {
                  EmployeeMessagesResponse: (
                    { evict },
                    { id, fieldName, variables }
                  ) => evict({ id, fieldName, args: variables }),
                  EmployeesResponse: (
                    { evict },
                    { id, fieldName, variables }
                  ) => evict({ id, fieldName, args: variables }),
                  EmployeeMessage: (
                    { evict, readField },
                    { ref, id, parent }
                  ) => {
                    if (
                      readField("id", parent.ref) ===
                      readField("employee_id", ref)
                    ) {
                      evict({ id });
                    }
                  },
                },
              },
            },
          },
        });
        cache.writeQuery({
          query: employeesQuery,
          data: employeesResponse,
        });
        cache.writeQuery({
          query: employeeMessagesQuery,
          data: employeeMessagesResponse,
        });
      });

      test("should evict the matching cascaded entities", () => {
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
        cache.writeQuery({
          query: deleteEmployeesMutation,
          data: deleteEmployeesResponse,
          variables: {
            deleteEmployeeId: employee.id,
          },
        });
        expect(cache.extract(true, false)).toEqual({
          [employee2.toRef()]: employee2,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            deleteEmployees: {
              __typename: "DeleteEmployeesResponse",
              data: { success: true },
            },
          },
        });
      });
    });
  });

  describe("with an Evict-on-Evict cache policy", () => {
    beforeEach(() => {
      cache = new InvalidationPolicyCache({
        invalidationPolicies: {
          types: {
            Employee: {
              onEvict: {
                EmployeeMessage: (
                  { evict, readField },
                  { id, ref, parent }
                ) => {
                  if (
                    readField("employee_id", ref) ===
                    readField("id", parent.ref)
                  ) {
                    evict({ id });
                  }
                },
              },
            },
          },
        },
      });
      cache.writeQuery({
        query: employeesAndMessagesQuery,
        data: employeesAndMessagesResponse,
      });
    });

    describe("when evicting the parent entity", () => {
      test("should trigger policy actions for the dependent entities", () => {
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
        });
        cache.evict({ id: employee.toRef() });
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
          [employee2.toRef()]: employee2,
          [employeeMessage2.toRef()]: employeeMessage2,
        });
      });
    });

    describe("when evicting a field of the parent entity", () => {
      test("should trigger policy actions for the dependent entities", () => {
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
        });
        cache.evict({ id: employee.toRef(), fieldName: "employee_name" });
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
          [employee.toRef()]: _.omit(employee, "employee_name"),
          [employee2.toRef()]: employee2,
          [employeeMessage2.toRef()]: employeeMessage2,
        });
      });
    });
  });

  describe("with a Write-on-Write cache policy", () => {
    describe("triggered by #writeQuery", () => {
      beforeEach(() => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            types: {
              CreateEmployeeResponse: {
                onWrite: {
                  EmployeesResponse: (
                    { modify, readField },
                    { storeFieldName, parent }
                  ) => {
                    const createEmployeeResponse: any = readField({
                      fieldName: parent.fieldName!,
                      args: parent.variables,
                      from: parent.ref,
                    });
                    modify({
                      fields: {
                        [storeFieldName!]: (existing) => {
                          return {
                            ...existing,
                            data: [
                              ...existing.data,
                              createEmployeeResponse.data,
                            ],
                          };
                        },
                      },
                    });
                  },
                },
              },
            },
          },
        });
      });

      test("should broadcast watches once after running all policies", () => {
        cache.writeQuery({
          query: employeesQuery,
          data: employeesResponse,
        });
        // @ts-ignore
        const broadcastWatchesSpy = jest.spyOn(cache, "broadcastWatches");
        cache.writeQuery({
          query: createEmployeeMutation,
          data: createEmployeeResponse,
        });
        expect(broadcastWatchesSpy).toHaveBeenCalledTimes(1);
        broadcastWatchesSpy.mockRestore();
      });

      describe("without query arguments", () => {
        test("should update the entity with a Write policy", () => {
          cache.writeQuery({
            query: employeesQuery,
            data: employeesResponse,
          });
          cache.writeQuery({
            query: createEmployeeMutation,
            data: createEmployeeResponse,
          });
          expect(cache.extract(true, false)).toEqual({
            [employee.toRef()]: employee,
            [employee2.toRef()]: employee2,
            [employee3.toRef()]: employee3,
            ROOT_QUERY: {
              __typename: "Query",
              createEmployee: {
                __typename: "CreateEmployeeResponse",
                data: { __ref: employee3.toRef() },
              },
              employees: {
                __typename: "EmployeesResponse",
                data: [
                  { __ref: employee.toRef() },
                  { __ref: employee2.toRef() },
                  { __ref: employee3.toRef() },
                ],
              },
            },
          });
        });

        describe("with variables passed", () => {
          test("should write the store field name without the passed variables", () => {
            const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
            cache.writeQuery({
              query: employeesQuery,
              data: employeesResponse,
              variables: {},
            });
            expect(cache.extract(true, true).invalidation).toEqual({
              entitiesById: {
                [employee.toRef()]: {
                  cacheTime: 0,
                  dataId: employee.toRef(),
                  typename: "Employee",
                },
                [employee2.toRef()]: {
                  cacheTime: 0,
                  dataId: employee2.toRef(),
                  typename: "Employee",
                },
                "ROOT_QUERY.employees": {
                  dataId: "ROOT_QUERY",
                  fieldName: "employees",
                  typename: "EmployeesResponse",
                  storeFieldNames: {
                    __size: 1,
                    entries: {
                      employees: {
                        args: null,
                        cacheTime: 0,
                        variables: {},
                      },
                    },
                  },
                },
              },
            });
            dateNowSpy.mockRestore();
          });
        });
      });

      describe("with query arguments", () => {
        test("should update the entity with a Write policy", () => {
          cache.writeQuery({
            query: employeesWithVariablesQuery,
            data: employeesResponse,
            variables: {
              name: "Tester McTest",
            },
          });
          cache.writeQuery({
            query: createEmployeeMutation,
            data: createEmployeeResponse,
          });
          expect(cache.extract(true, false)).toEqual({
            [employee.toRef()]: employee,
            [employee2.toRef()]: employee2,
            [employee3.toRef()]: employee3,
            ROOT_QUERY: {
              __typename: "Query",
              createEmployee: {
                __typename: "CreateEmployeeResponse",
                data: { __ref: employee3.toRef() },
              },
              'employees({"name":"Tester McTest"})': {
                __typename: "EmployeesResponse",
                data: [
                  { __ref: employee.toRef() },
                  { __ref: employee2.toRef() },
                  { __ref: employee3.toRef() },
                ],
              },
            },
          });
        });

        describe("with matching variables passed", () => {
          test("should write the store field name with the matching variables into the entity type map", () => {
            const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
            cache.writeQuery({
              query: employeesWithVariablesQuery,
              data: employeesResponse,
              variables: {
                name: "Tester McTest",
              },
            });
            expect(cache.extract(true, true).invalidation).toEqual({
              entitiesById: {
                [employee.toRef()]: {
                  cacheTime: 0,
                  dataId: employee.toRef(),
                  typename: "Employee",
                },
                [employee2.toRef()]: {
                  cacheTime: 0,
                  dataId: employee2.toRef(),
                  typename: "Employee",
                },
                "ROOT_QUERY.employees": {
                  dataId: "ROOT_QUERY",
                  fieldName: "employees",
                  typename: "EmployeesResponse",
                  storeFieldNames: {
                    __size: 1,
                    entries: {
                      'employees({"name":"Tester McTest"})': {
                        cacheTime: 0,
                        variables: { name: "Tester McTest" },
                        args: { name: "Tester McTest" }
                      },
                    },
                  },
                },
              },
            });
            dateNowSpy.mockRestore();
          });
        });

        describe("with extra variables passed", () => {
          test("should write the store field name with the subset of matching variables into the entity type map", () => {
            const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
            cache.writeQuery({
              query: employeesWithVariablesQuery,
              data: employeesResponse,
              variables: {
                name: "Tester McTest",
                unsupportedField: true,
              },
            });
            expect(cache.extract(true, true).invalidation).toEqual({
              entitiesById: {
                [employee.toRef()]: {
                  cacheTime: 0,
                  dataId: employee.toRef(),
                  typename: "Employee",
                },
                [employee2.toRef()]: {
                  cacheTime: 0,
                  dataId: employee2.toRef(),
                  typename: "Employee",
                },
                "ROOT_QUERY.employees": {
                  dataId: "ROOT_QUERY",
                  fieldName: "employees",
                  typename: "EmployeesResponse",
                  storeFieldNames: {
                    __size: 1,
                    entries: {
                      'employees({"name":"Tester McTest"})': {
                        cacheTime: 0,
                        variables: {
                          name: "Tester McTest",
                          unsupportedField: true,
                        },
                        args: {
                          name: "Tester McTest",
                        },
                      },
                    },
                  },
                },
              },
            });
            dateNowSpy.mockRestore();
          });
        });
      });

      describe("with mutation arguments", () => {
        test("should update the entity with a Write policy", () => {
          cache.writeQuery({
            query: employeesQuery,
            data: employeesResponse,
          });
          cache.writeQuery({
            query: createEmployeeMutationWithVariables,
            data: createEmployeeResponse,
            variables: {
              name: 'Tester McTest'
            }
          });
          expect(cache.extract(true, false)).toEqual({
            [employee.toRef()]: employee,
            [employee2.toRef()]: employee2,
            [employee3.toRef()]: employee3,
            ROOT_QUERY: {
              __typename: "Query",
              'createEmployee({"name":"Tester McTest"})': {
                __typename: "CreateEmployeeResponse",
                data: { __ref: employee3.toRef() },
              },
              employees: {
                __typename: "EmployeesResponse",
                data: [
                  { __ref: employee.toRef() },
                  { __ref: employee2.toRef() },
                  { __ref: employee3.toRef() },
                ],
              },
            },
          });
        });
      })

      describe("while operating on an optimistic layer", () => {
        test("should not trigger write policies", () => {
          cache.writeQuery({
            query: employeesQuery,
            data: employeesResponse,
          });
          cache.recordOptimisticTransaction((proxy) => {
            proxy.writeQuery({
              query: createEmployeeMutation,
              data: createEmployeeResponse,
            });
          }, "update employee");
          expect(cache.extract(true, false)).toEqual({
            [employee.toRef()]: employee,
            [employee2.toRef()]: employee2,
            [employee3.toRef()]: employee3,
            ROOT_QUERY: {
              __typename: "Query",
              createEmployee: {
                __typename: "CreateEmployeeResponse",
                data: { __ref: employee3.toRef() },
              },
              employees: {
                __typename: "EmployeesResponse",
                data: [
                  { __ref: employee.toRef() },
                  { __ref: employee2.toRef() },
                ],
              },
            },
          });
        });
      });
    });

    describe("triggered by #writeFragment", () => {
      beforeEach(() => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            types: {
              Employee: {
                onWrite: {
                  EmployeeMessage: (
                    { modify, readField },
                    { id, ref, parent }
                  ) => {
                    if (
                      readField("employee_id", ref) ===
                      readField("id", parent.ref)
                    ) {
                      modify({
                        id,
                        fields: {
                          employee_message: () => "je pense donc je suis",
                        },
                      });
                    }
                  },
                },
              },
            },
          },
        });
        cache.writeQuery({
          query: employeesQuery,
          data: employeesResponse,
        });
        cache.writeQuery({
          query: employeeMessagesQuery,
          data: employeeMessagesResponse,
        });
      });

      test("should update the entity with a Write policy", () => {
        cache.writeFragment({
          fragment: gql`
            fragment updateEmployee on Employee {
              employee_name
            }
          `,
          id: employee.toRef(),
          data: {
            employee_name: "Tester McTest",
          },
        });
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: {
            ...employee,
            employee_name: "Tester McTest",
          },
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: {
            ...employeeMessage,
            employee_message: "je pense donc je suis",
          },
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
          __META: {
            extraRootIds: [
              employee.toRef(),
            ],
          }
        });
      });

      test("should broadcast watches once after running all policies", () => {
        // @ts-ignore
        const broadcastWatchesSpy = jest.spyOn(cache, "broadcastWatches");
        cache.writeFragment({
          fragment: gql`
            fragment updateEmployee on Employee {
              employee_name
            }
          `,
          id: employee.toRef(),
          data: {
            employee_name: "Tester McTest",
          },
        });
        expect(broadcastWatchesSpy).toHaveBeenCalledTimes(1);
        broadcastWatchesSpy.mockRestore();
      });
    });

    describe("triggered by #modify", () => {
      describe("for a query cache entity", () => {
        beforeEach(() => {
          cache = new InvalidationPolicyCache({
            invalidationPolicies: {
              types: {
                DeleteEmployeesResponse: {
                  onWrite: {
                    EmployeesResponse: ({ modify }, { storeFieldName }) => {
                      modify({
                        fields: {
                          [storeFieldName!]: (existing) => {
                            return {
                              ...existing,
                              data: [],
                            };
                          },
                        },
                      });
                    },
                  },
                },
              },
            },
          });
          cache.writeQuery({
            query: deleteEmployeesMutation,
            data: deleteEmployeesResponseFailed,
          });
          cache.writeQuery({
            query: employeesQuery,
            data: employeesResponse,
          });
        });

        test("should update the entity with a Write policy", () => {
          expect(cache.extract(true, false)).toEqual({
            [employee.toRef()]: employee,
            [employee2.toRef()]: employee2,
            ROOT_QUERY: {
              __typename: "Query",
              employees: {
                __typename: "EmployeesResponse",
                data: [
                  { __ref: employee.toRef() },
                  { __ref: employee2.toRef() },
                ],
              },
              deleteEmployees: {
                __typename: "DeleteEmployeesResponse",
                data: {
                  success: false,
                },
              },
            },
          });
          cache.modify({
            fields: {
              deleteEmployees: (existing) => ({
                ...existing,
                data: { ...existing.data, success: true },
              }),
            },
          });
          expect(cache.extract(true, false)).toEqual({
            [employee.toRef()]: employee,
            [employee2.toRef()]: employee2,
            ROOT_QUERY: {
              __typename: "Query",
              employees: {
                __typename: "EmployeesResponse",
                data: [],
              },
              deleteEmployees: {
                __typename: "DeleteEmployeesResponse",
                data: {
                  success: true,
                },
              },
            },
          });
        });

        test("should broadcast watches once after running all policies", () => {
          // @ts-ignore
          const broadcastWatchesSpy = jest.spyOn(cache, "broadcastWatches");
          cache.modify({
            fields: {
              deleteEmployees: (existing) => ({
                ...existing,
                data: { ...existing.data, success: true },
              }),
            },
          });
          expect(broadcastWatchesSpy).toHaveBeenCalledTimes(1);
          broadcastWatchesSpy.mockRestore();
        });
      });

      describe("for a normalized cache entity", () => {
        beforeEach(() => {
          cache = new InvalidationPolicyCache({
            invalidationPolicies: {
              types: {
                Employee: {
                  onWrite: {
                    EmployeeMessagesResponse: (
                      { modify, readField },
                      { storeFieldName, parent }
                    ) => {
                      modify({
                        fields: {
                          [storeFieldName!]: (existing) => {
                            return {
                              ...existing,
                              data: existing.data.filter(
                                (employeeMessage: any) =>
                                  readField("employee_id", employeeMessage) ===
                                  readField("id", parent.ref)
                              ),
                            };
                          },
                        },
                      });
                    },
                  },
                },
              },
            },
          });
        });

        test("should update the entity with a Write policy", () => {
          cache.writeQuery({
            query: employeesQuery,
            data: employeesResponse,
          });
          cache.writeQuery({
            query: employeeMessagesQuery,
            data: employeeMessagesResponse,
          });
          cache.modify({
            id: employee.toRef(),
            fields: {
              employee_name: () => "Tester McTest",
            },
          });
          expect(cache.extract(true, false)).toEqual({
            [employee.toRef()]: {
              ...employee,
              employee_name: "Tester McTest",
            },
            [employee2.toRef()]: employee2,
            [employeeMessage.toRef()]: employeeMessage,
            [employeeMessage2.toRef()]: employeeMessage2,
            ROOT_QUERY: {
              __typename: "Query",
              employees: {
                __typename: "EmployeesResponse",
                data: [
                  { __ref: employee.toRef() },
                  { __ref: employee2.toRef() },
                ],
              },
              employeeMessages: {
                __typename: "EmployeeMessagesResponse",
                data: [{ __ref: employeeMessage.toRef() }],
              },
            },
          });
        });
      });
    });

    describe("triggered by writing nested objects", () => {
      beforeEach(() => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            types: {
              Employee: {
                onWrite: {
                  EmployeeMessage: (
                    { modify, readField },
                    { ref, id, parent }
                  ) => {
                    if (
                      readField("employee_id", ref) ===
                      readField("id", parent.ref)
                    ) {
                      modify({
                        id,
                        fields: {
                          employee_message: () => "Cogito ergo sum",
                        },
                      });
                    }
                  },
                },
              },
            },
          },
        });

        cache.writeQuery({
          query: employeeMessagesQuery,
          data: employeeMessagesResponse,
        });
      });

      test("should update the entity with a Write policy", () => {
        expect(cache.extract(true, false)).toEqual({
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
        cache.writeQuery({
          query: employeesQuery,
          data: employeesResponse,
        });
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: {
            ...employeeMessage,
            employee_message: "Cogito ergo sum",
          },
          [employeeMessage2.toRef()]: {
            ...employeeMessage2,
            employee_message: "Cogito ergo sum",
          },
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
      });
    });
  });

  describe("with a cascading Write-on-Write cache policy", () => {
    beforeEach(() => {
      cache = new InvalidationPolicyCache({
        invalidationPolicies: {
          types: {
            DeleteEmployeesResponse: {
              onWrite: {
                EmployeesResponse: ({ modify }, { storeFieldName }) => {
                  modify({
                    fields: {
                      [storeFieldName!]: (existing) => {
                        return {
                          ...existing,
                          data: [],
                        };
                      },
                    },
                  });
                },
              },
            },
            EmployeesResponse: {
              onWrite: {
                EmployeeMessagesResponse: ({ modify }, { storeFieldName }) => {
                  modify({
                    fields: {
                      [storeFieldName!]: (existing) => {
                        return {
                          ...existing,
                          data: [],
                        };
                      },
                    },
                  });
                },
              },
            },
          },
        },
      });
      cache.writeQuery({
        query: employeesQuery,
        data: employeesResponse,
      });

      cache.writeQuery({
        query: employeeMessagesQuery,
        data: employeeMessagesResponse,
      });
    });

    test("should update the cascaded entities", () => {
      expect(cache.extract(true, false)).toEqual({
        [employee.toRef()]: employee,
        [employee2.toRef()]: employee2,
        [employeeMessage.toRef()]: employeeMessage,
        [employeeMessage2.toRef()]: employeeMessage2,
        ROOT_QUERY: {
          __typename: "Query",
          employees: {
            __typename: "EmployeesResponse",
            data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
          },
          employeeMessages: {
            __typename: "EmployeeMessagesResponse",
            data: [
              { __ref: employeeMessage.toRef() },
              { __ref: employeeMessage2.toRef() },
            ],
          },
        },
      });

      cache.writeQuery({
        query: deleteEmployeesMutation,
        data: deleteEmployeesResponse,
      });

      expect(cache.extract(true, false)).toEqual({
        [employee.toRef()]: employee,
        [employee2.toRef()]: employee2,
        [employeeMessage.toRef()]: employeeMessage,
        [employeeMessage2.toRef()]: employeeMessage2,
        ROOT_QUERY: {
          __typename: "Query",
          employees: {
            __typename: "EmployeesResponse",
            data: [],
          },
          employeeMessages: {
            __typename: "EmployeeMessagesResponse",
            data: [],
          },
          deleteEmployees: {
            __typename: "DeleteEmployeesResponse",
            data: { success: true },
          },
        },
      });
    });
  });

  describe("with a timeToLive policy", () => {
    let timeToLive: number;
    let dateNowSpy: any;

    describe("with only a default timeToLive policy", () => {
      test("should evict the expired entities from the cache", () => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            timeToLive: 100,
          },
        });
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
        cache.writeQuery({
          query: employeesAndMessagesQuery,
          data: employeesAndMessagesResponse,
        });
        dateNowSpy.mockRestore();
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);

        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
        const queryResult = cache.readQuery({
          query: employeesAndMessagesQuery,
        });
        expect(queryResult).toEqual({});
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
          },
        });
      });
    });

    describe("with only a type specific timeToLive policy", () => {
      describe("when reading a query", () => {
        describe("that has no expired query fields", () => {
          beforeEach(() => {
            timeToLive = 500;
          });

          test("should not evict the query from the cache", () => {
            cache = new InvalidationPolicyCache({
              invalidationPolicies: {
                types: {
                  EmployeesResponse: {
                    timeToLive,
                  },
                },
              },
            });
            let dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
            cache.writeQuery({
              query: employeesQuery,
              data: employeesResponse,
            });
            dateNowSpy.mockRestore();
            dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(100);
            const queryResult = cache.readQuery({
              query: employeesQuery,
            });
            expect(queryResult).toEqual({
              employees: {
                __typename: "EmployeesResponse",
                data: [employee, employee2],
              },
            });
            dateNowSpy.mockRestore();
            expect(cache.extract(true, false)).toEqual({
              [employee.toRef()]: employee,
              [employee2.toRef()]: employee2,
              ROOT_QUERY: {
                __typename: "Query",
                employees: {
                  __typename: "EmployeesResponse",
                  data: [
                    { __ref: employee.toRef() },
                    { __ref: employee2.toRef() },
                  ],
                },
              },
            });
          });

          describe("that has nested expired entities", () => {
            beforeEach(() => {
              cache = new InvalidationPolicyCache({
                invalidationPolicies: {
                  types: {
                    Employee: {
                      timeToLive,
                    },
                  },
                },
              });
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
              cache.writeQuery({
                query: employeesAndMessagesQuery,
                data: employeesAndMessagesResponse,
              });
              dateNowSpy.mockRestore();
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(501);
            });

            afterEach(() => {
              dateNowSpy.mockRestore();
            });

            test("should evict the nested entities from the cache", () => {
              const queryResult = cache.readQuery({
                query: employeesAndMessagesQuery,
              });
              expect(queryResult).toEqual({
                employees: {
                  __typename: "EmployeesResponse",
                  data: [],
                },
                employeeMessages: {
                  __typename: "EmployeeMessagesResponse",
                  data: [employeeMessage, employeeMessage2],
                },
              });
              expect(cache.extract(true, false)).toEqual({
                [employeeMessage.toRef()]: employeeMessage,
                [employeeMessage2.toRef()]: employeeMessage2,
                ROOT_QUERY: {
                  __typename: "Query",
                  employees: {
                    __typename: "EmployeesResponse",
                    data: [
                      { __ref: employee.toRef() },
                      { __ref: employee2.toRef() },
                    ],
                  },
                  employeeMessages: {
                    __typename: "EmployeeMessagesResponse",
                    data: [
                      { __ref: employeeMessage.toRef() },
                      { __ref: employeeMessage2.toRef() },
                    ],
                  },
                },
              });
            });
          });

          describe("that has a direct expired entity", () => {
            let dateNowSpy: any;

            beforeEach(() => {
              cache = new InvalidationPolicyCache({
                invalidationPolicies: {
                  types: {
                    Employee: {
                      timeToLive,
                    },
                  },
                },
              });
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
              cache.writeQuery({
                query: employeesQuery,
                data: {
                  employees: {
                    __typename: "EmployeesResponse",
                    data: employee,
                  },
                },
              });
              dateNowSpy.mockRestore();
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(501);
            });

            afterEach(() => {
              dateNowSpy.mockRestore();
            });

            test("should evict the direct entity from the cache", () => {
              const queryResult = cache.readQuery({
                query: employeesQuery,
              });
              expect(queryResult).toEqual({
                employees: {
                  __typename: "EmployeesResponse",
                },
              });
              expect(cache.extract(true, false)).toEqual({
                ROOT_QUERY: {
                  __typename: "Query",
                  employees: {
                    __typename: "EmployeesResponse",
                    data: { __ref: employee.toRef() },
                  },
                },
              });
            });
          });
        });

        describe("that has expired query fields", () => {
          beforeEach(() => {
            timeToLive = 100;
          });

          describe("while broadcasting watches", () => {
            test("should not evict the expired query field from the cache", () => {
              cache = new InvalidationPolicyCache({
                invalidationPolicies: {
                  types: {
                    EmployeesResponse: {
                      timeToLive,
                    },
                  },
                },
              });
              let dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
              cache.writeQuery({
                query: employeesQuery,
                data: employeesResponse,
              });
              dateNowSpy.mockRestore();
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);
              // @ts-ignore
              cache.broadcastWatches();
              expect(cache.extract(true, false)).toEqual({
                [employee.toRef()]: employee,
                [employee2.toRef()]: employee2,
                ROOT_QUERY: {
                  __typename: "Query",
                  employees: {
                    __typename: "EmployeesResponse",
                    data: [
                      { __ref: employee.toRef() },
                      { __ref: employee2.toRef() },
                    ],
                  },
                },
              });
              dateNowSpy.mockRestore();
            });
          });

          describe("for a query without args", () => {
            let dateNowSpy: any;

            beforeEach(() => {
              cache = new InvalidationPolicyCache({
                invalidationPolicies: {
                  types: {
                    EmployeesResponse: {
                      timeToLive,
                    },
                    EmployeeMessagesResponse: {
                      timeToLive,
                    },
                  },
                },
              });
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
              cache.writeQuery({
                query: employeesAndMessagesQuery,
                data: employeesAndMessagesResponse,
              });
              dateNowSpy.mockRestore();
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);
            });

            afterEach(() => {
              dateNowSpy.mockRestore();
            });

            test("should evict the expired query from the cache", () => {
              expect(cache.extract(true, false)).toEqual({
                [employee.toRef()]: employee,
                [employee2.toRef()]: employee2,
                [employeeMessage.toRef()]: employeeMessage,
                [employeeMessage2.toRef()]: employeeMessage2,
                ROOT_QUERY: {
                  __typename: "Query",
                  employees: {
                    __typename: "EmployeesResponse",
                    data: [
                      { __ref: employee.toRef() },
                      { __ref: employee2.toRef() },
                    ],
                  },
                  employeeMessages: {
                    __typename: "EmployeeMessagesResponse",
                    data: [
                      { __ref: employeeMessage.toRef() },
                      { __ref: employeeMessage2.toRef() },
                    ],
                  },
                },
              });
              const queryResult = cache.readQuery({
                query: employeesAndMessagesQuery,
              });
              expect(queryResult).toEqual({});
              expect(cache.extract(true, false)).toEqual({
                [employee.toRef()]: employee,
                [employee2.toRef()]: employee2,
                [employeeMessage.toRef()]: employeeMessage,
                [employeeMessage2.toRef()]: employeeMessage2,
                ROOT_QUERY: {
                  __typename: "Query",
                },
              });
            });

            test("should only broadcast watches once after evicting all expired fields", () => {
              // @ts-ignore
              const broadcastWatchesSpy = jest.spyOn(cache, "broadcastWatches");
              cache.readQuery({
                query: employeesAndMessagesQuery,
              });
              expect(broadcastWatchesSpy).toHaveBeenCalledTimes(1);
              broadcastWatchesSpy.mockRestore();
            });

            describe("read with empty variables", () => {
              test("should evict the expired query and ignore the empty variables", () => {
                const queryResult = cache.readQuery({
                  query: employeesAndMessagesQuery,
                  variables: {},
                });
                expect(queryResult).toEqual({});
                expect(cache.extract(true, false)).toEqual({
                  [employee.toRef()]: employee,
                  [employee2.toRef()]: employee2,
                  [employeeMessage.toRef()]: employeeMessage,
                  [employeeMessage2.toRef()]: employeeMessage2,
                  ROOT_QUERY: {
                    __typename: "Query",
                  },
                });
              });
            });
          });

          describe("for a query with arguments", () => {
            describe("read with matching variables", () => {
              test("should evict the expired query fields with matching variables from the cache", () => {
                cache = new InvalidationPolicyCache({
                  invalidationPolicies: {
                    types: {
                      EmployeesResponse: {
                        timeToLive,
                      },
                    },
                  },
                });
                let dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
                cache.writeQuery({
                  query: employeesWithVariablesQuery,
                  data: employeesResponse,
                  variables: {
                    name: "Test Evict",
                  },
                });
                cache.writeQuery({
                  query: employeesWithVariablesQuery,
                  data: employeesResponse,
                  variables: {
                    name: "Test No Evict",
                  },
                });
                dateNowSpy.mockRestore();
                dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);
                const queryResult = cache.readQuery({
                  query: employeesWithVariablesQuery,
                  variables: {
                    name: "Test Evict",
                  },
                });
                expect(queryResult).toEqual({});
                expect(cache.extract(true, false)).toEqual({
                  [employee.toRef()]: employee,
                  [employee2.toRef()]: employee2,
                  ROOT_QUERY: {
                    __typename: "Query",
                    // prettier-ignore
                    "employees({\"name\":\"Test No Evict\"})": {
                      __typename: "EmployeesResponse",
                      data: [
                        { __ref: employee.toRef() },
                        { __ref: employee2.toRef() },
                      ],
                    }
                  },
                });
                dateNowSpy.mockRestore();
              });
            });

            describe("read with extra variables", () => {
              test("should evict the expired query fields with fields matching the supported subset of variables", () => {
                cache = new InvalidationPolicyCache({
                  invalidationPolicies: {
                    types: {
                      EmployeesResponse: {
                        timeToLive,
                      },
                    },
                  },
                });
                let dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
                cache.writeQuery({
                  query: employeesWithVariablesQuery,
                  data: employeesResponse,
                });
                dateNowSpy.mockRestore();
                dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);
                const queryResult = cache.readQuery({
                  query: employeesWithVariablesQuery,
                  variables: {
                    unsupportedField: true,
                  },
                });
                expect(queryResult).toEqual({});
                expect(cache.extract(true, false)).toEqual({
                  [employee.toRef()]: employee,
                  [employee2.toRef()]: employee2,
                  ROOT_QUERY: {
                    __typename: "Query",
                  },
                });
                dateNowSpy.mockRestore();
              });
            });

            describe("read with empty variables", () => {
              test("should evict the expired query with empty variables", () => {
                cache = new InvalidationPolicyCache({
                  invalidationPolicies: {
                    types: {
                      EmployeesResponse: {
                        timeToLive,
                      },
                    },
                  },
                });
                let dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
                cache.writeQuery({
                  query: employeesWithVariablesQuery,
                  data: employeesResponse,
                  variables: {},
                });
                cache.writeQuery({
                  query: employeesWithVariablesQuery,
                  data: employeesResponse,
                  variables: {
                    name: "Test",
                  },
                });
                dateNowSpy.mockRestore();
                dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);
                expect(cache.extract(true, false)).toEqual({
                  [employee.toRef()]: employee,
                  [employee2.toRef()]: employee2,
                  ROOT_QUERY: {
                    __typename: "Query",
                    "employees({})": {
                      __typename: "EmployeesResponse",
                      data: [
                        { __ref: employee.toRef() },
                        { __ref: employee2.toRef() },
                      ],
                    },
                    'employees({"name":"Test"})': {
                      __typename: "EmployeesResponse",
                      data: [
                        { __ref: employee.toRef() },
                        { __ref: employee2.toRef() },
                      ],
                    },
                  },
                });
                const queryResult = cache.readQuery({
                  query: employeesWithVariablesQuery,
                  variables: {},
                });
                expect(queryResult).toEqual({});
                expect(cache.extract(true, false)).toEqual({
                  [employee.toRef()]: employee,
                  [employee2.toRef()]: employee2,
                  ROOT_QUERY: {
                    __typename: "Query",
                    'employees({"name":"Test"})': {
                      __typename: "EmployeesResponse",
                      data: [
                        { __ref: employee.toRef() },
                        { __ref: employee2.toRef() },
                      ],
                    },
                  },
                });
                dateNowSpy.mockRestore();
              });
            });
          });

          describe("that has been re-written since expiring", () => {
            test("should not evict the query field from the cache", () => {
              cache = new InvalidationPolicyCache({
                invalidationPolicies: {
                  types: {
                    EmployeesResponse: {
                      timeToLive,
                    },
                  },
                },
              });
              let dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
              cache.writeQuery({
                query: employeesQuery,
                data: employeesResponse,
              });
              dateNowSpy.mockRestore();
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(100);
              cache.writeQuery({
                query: employeesQuery,
                data: employeesResponse,
              });
              dateNowSpy.mockRestore();
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(199);
              const queryResult = cache.readQuery({
                query: employeesQuery,
              });
              expect(queryResult).toEqual({
                employees: {
                  __typename: "EmployeesResponse",
                  data: [employee, employee2],
                },
              });
              expect(cache.extract(true, false)).toEqual({
                [employee.toRef()]: employee,
                [employee2.toRef()]: employee2,
                ROOT_QUERY: {
                  __typename: "Query",
                  employees: {
                    __typename: "EmployeesResponse",
                    data: [
                      { __ref: employee.toRef() },
                      { __ref: employee2.toRef() },
                    ],
                  },
                },
              });
              dateNowSpy.mockRestore();
            });
          });

          describe("that has nested expired entities", () => {
            let dateNowSpy: any;

            beforeEach(() => {
              cache = new InvalidationPolicyCache({
                invalidationPolicies: {
                  types: {
                    EmployeesResponse: {
                      timeToLive,
                    },
                    Employee: {
                      timeToLive,
                    },
                  },
                },
              });
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
              cache.writeQuery({
                query: employeesAndMessagesQuery,
                data: employeesAndMessagesResponse,
              });
              dateNowSpy.mockRestore();
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);
            });

            afterEach(() => {
              dateNowSpy.mockRestore();
            });

            test("should evict the query and the nested entities from the cache", () => {
              const queryResult = cache.readQuery({
                query: employeesAndMessagesQuery,
              });
              expect(queryResult).toEqual({
                employeeMessages: {
                  __typename: "EmployeeMessagesResponse",
                  data: [employeeMessage, employeeMessage2],
                },
              });
              expect(cache.extract(true, false)).toEqual({
                [employeeMessage.toRef()]: employeeMessage,
                [employeeMessage2.toRef()]: employeeMessage2,
                ROOT_QUERY: {
                  __typename: "Query",
                  employeeMessages: {
                    __typename: "EmployeeMessagesResponse",
                    data: [
                      { __ref: employeeMessage.toRef() },
                      { __ref: employeeMessage2.toRef() },
                    ],
                  },
                },
              });
            });
          });

          describe("that has a direct expired entity", () => {
            let dateNowSpy: any;

            beforeEach(() => {
              cache = new InvalidationPolicyCache({
                invalidationPolicies: {
                  types: {
                    EmployeesResponse: {
                      timeToLive,
                    },
                    Employee: {
                      timeToLive,
                    },
                  },
                },
              });
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
              cache.writeQuery({
                query: employeesQuery,
                data: {
                  employees: {
                    __typename: "EmployeesResponse",
                    data: employee,
                  },
                },
              });
              dateNowSpy.mockRestore();
              dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);
            });

            afterEach(() => {
              dateNowSpy.mockRestore();
            });

            test("should evict the query and the direct entity from the cache", () => {
              const queryResult = cache.readQuery({
                query: employeesQuery,
              });
              expect(queryResult).toEqual({});
              expect(cache.extract(true, false)).toEqual({
                ROOT_QUERY: {
                  __typename: "Query",
                },
              });
            });
          });
        });

        describe("that has no corresponding entities in the cache", () => {
          beforeEach(() => {
            cache = new InvalidationPolicyCache({
              invalidationPolicies: {
                types: {
                  EmployeesResponse: {
                    timeToLive,
                  },
                },
              },
            });
            cache.writeQuery({
              query: employeesQuery,
              data: {
                employees: null,
              },
            });
            cache.readQuery({
              query: employeesQuery,
            });
          });

          test("should not try and run any read policies", () => {
            expect(cache.extract(true, false)).toEqual({
              ROOT_QUERY: {
                __typename: "Query",
                employees: null,
              },
            });
          });
        });
      });

      describe("when reading a fragment", () => {
        const employeeFragment = gql`
          fragment employee on Employee {
            id
            employee_name
            employee_age
            employee_salary
          }
        `;

        describe("that is not expired", () => {
          beforeEach(() => {
            timeToLive = 500;
          });

          test("should not evict the query from the cache", () => {
            cache = new InvalidationPolicyCache({
              invalidationPolicies: {
                types: {
                  Employee: {
                    timeToLive,
                  },
                },
              },
            });
            let dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
            cache.writeQuery({
              query: employeesQuery,
              data: employeesResponse,
            });
            dateNowSpy.mockRestore();
            dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(100);
            const fragmentResult = cache.readFragment({
              id: `Employee:${employee.id}`,
              fragment: employeeFragment,
            });
            expect(fragmentResult).toEqual(employee);
            dateNowSpy.mockRestore();
            expect(cache.extract(true, false)).toEqual({
              [employee.toRef()]: employee,
              [employee2.toRef()]: employee2,
              ROOT_QUERY: {
                __typename: "Query",
                employees: {
                  __typename: "EmployeesResponse",
                  data: [
                    { __ref: employee.toRef() },
                    { __ref: employee2.toRef() },
                  ],
                },
              },
            });
          });
        });

        describe("that is expired", () => {
          beforeEach(() => {
            timeToLive = 100;
          });

          test("should evict the normalized object from the cache", () => {
            cache = new InvalidationPolicyCache({
              invalidationPolicies: {
                types: {
                  Employee: {
                    timeToLive,
                  },
                },
              },
            });
            let dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
            cache.writeQuery({
              query: employeesQuery,
              data: employeesResponse,
            });
            dateNowSpy.mockRestore();
            dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);
            const fragmentResult = cache.readFragment({
              id: `Employee:${employee.id}`,
              fragment: employeeFragment,
            });
            expect(fragmentResult).toEqual(null);
            dateNowSpy.mockRestore();
            expect(cache.extract(true, false)).toEqual({
              [employee2.toRef()]: employee2,
              ROOT_QUERY: {
                __typename: "Query",
                employees: {
                  __typename: "EmployeesResponse",
                  data: [
                    { __ref: employee.toRef() },
                    { __ref: employee2.toRef() },
                  ],
                },
              },
            });
          });
        });
      });
    });

    describe("with both a default and type specific timeToLive policy", () => {
      beforeEach(() => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            timeToLive: 100,
            types: {
              EmployeesResponse: {
                timeToLive: 200,
              },
            },
          },
        });
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
        cache.writeQuery({
          query: employeesAndMessagesQuery,
          data: employeesAndMessagesResponse,
        });
        dateNowSpy.mockRestore();
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);
      });

      afterEach(() => {
        dateNowSpy.mockRestore();
      });

      test("should favor the type specific timeToLive policy", () => {
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
        const queryResult = cache.readQuery({
          query: employeesAndMessagesQuery,
        });
        expect(queryResult).toEqual({
          employees: {
            __typename: "EmployeesResponse",
            data: [],
          },
        });
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
          },
        });
      });
    });

    describe("with an AccessOnly renewal policy", () => {
      test("should renew the type on read and not evict entities", () => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            timeToLive: 100,
            renewalPolicy: RenewalPolicy.AccessOnly,
          },
        });
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
        cache.writeQuery({
          query: employeesAndMessagesQuery,
          data: employeesAndMessagesResponse,
        });
        dateNowSpy.mockRestore();
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);

        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
        const queryResult = cache.readQuery({
          query: employeesAndMessagesQuery,
        });
        expect(queryResult).toEqual({
          employeeMessages: {
            __typename: "EmployeeMessagesResponse",
            data: [employeeMessage, employeeMessage2],
          },
          employees: {
            __typename: "EmployeesResponse",
            data: [employee, employee2],
          },
        });
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
      });
    });

    describe("with an AccessAndWrite renewal policy", () => {
      test("should renew the type on read and not evict entities", () => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            timeToLive: 100,
            renewalPolicy: RenewalPolicy.AccessAndWrite,
          },
        });
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
        cache.writeQuery({
          query: employeesAndMessagesQuery,
          data: employeesAndMessagesResponse,
        });
        dateNowSpy.mockRestore();
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);

        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
        const queryResult = cache.readQuery({
          query: employeesAndMessagesQuery,
        });
        expect(queryResult).toEqual({
          employeeMessages: {
            __typename: "EmployeeMessagesResponse",
            data: [employeeMessage, employeeMessage2],
          },
          employees: {
            __typename: "EmployeesResponse",
            data: [employee, employee2],
          },
        });
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
      });
    });

    describe("with a WriteOnly renewal policy", () => {
      test("should evict the expired entities on write", () => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            timeToLive: 100,
            renewalPolicy: RenewalPolicy.WriteOnly,
          },
        });
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
        cache.writeQuery({
          query: employeesAndMessagesQuery,
          data: employeesAndMessagesResponse,
        });
        dateNowSpy.mockRestore();
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);

        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
        const queryResult = cache.readQuery({
          query: employeesAndMessagesQuery,
        });
        expect(queryResult).toEqual({});
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
          },
        });
      });
    });

    describe("with a None renewal policy", () => {
      test("should evict the expired entities on write", () => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            timeToLive: 100,
            renewalPolicy: RenewalPolicy.None,
          },
        });
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
        cache.writeQuery({
          query: employeesAndMessagesQuery,
          data: employeesAndMessagesResponse,
        });
        dateNowSpy.mockRestore();
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);

        cache.writeQuery({
          query: employeesAndMessagesQuery,
          data: employeesAndMessagesResponse,
        });

        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });

        const queryResult = cache.readQuery({
          query: employeesAndMessagesQuery,
        });
        expect(queryResult).toEqual({});
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
          },
        });
      });
    });
  });

  describe('with a default cache policy', () => {
    let sideEffect: string;

    beforeEach(() => {
      cache = new InvalidationPolicyCache({
        invalidationPolicies: {
          types: {
            EmployeesResponse: {
              onWrite: {
                __default: (_cacheOperations, { parent: { storeFieldName } }) => {
                  sideEffect = `${storeFieldName} field written to the cache`;
                }
              },
            },
          },
        },
      });
      cache.writeQuery({
        query: employeesQuery,
        data: employeesResponse,
      });
    });

    test("should run the default policy action on parent write", () => {
      cache.writeQuery({
        query: employeesQuery,
        data: employeesResponse,
      });
      expect(sideEffect).toEqual('employees field written to the cache');
    });
  })

  describe("#expire", () => {
    let dateNowSpy: any;

    describe("with all expired entities", () => {
      test("should evict all expired entities from the cache", () => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            timeToLive: 100,
          },
        });
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
        cache.writeQuery({
          query: employeesAndMessagesQuery,
          data: employeesAndMessagesResponse,
        });
        dateNowSpy.mockRestore();
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);

        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
        const expiredEntityIds = cache.expire();
        expect(expiredEntityIds).toEqual([
          employee.toRef(),
          employee2.toRef(),
          employeeMessage.toRef(),
          employeeMessage2.toRef(),
          "ROOT_QUERY.employees",
          "ROOT_QUERY.employeeMessages",
        ]);
        expect(cache.extract(true, false)).toEqual({
          ROOT_QUERY: {
            __typename: "Query",
          },
        });
      });
    });

    describe("with partial expired entities", () => {
      test("should evict all expired entities from the cache", () => {
        cache = new InvalidationPolicyCache({
          invalidationPolicies: {
            timeToLive: 100,
            types: {
              Employee: {
                timeToLive: 150,
              },
            },
          },
        });
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
        cache.writeQuery({
          query: employeesAndMessagesQuery,
          data: employeesAndMessagesResponse,
        });
        dateNowSpy.mockRestore();
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);

        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          [employeeMessage.toRef()]: employeeMessage,
          [employeeMessage2.toRef()]: employeeMessage2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
            employeeMessages: {
              __typename: "EmployeeMessagesResponse",
              data: [
                { __ref: employeeMessage.toRef() },
                { __ref: employeeMessage2.toRef() },
              ],
            },
          },
        });
        const expiredEntityIds = cache.expire();
        expect(expiredEntityIds).toEqual([
          employeeMessage.toRef(),
          employeeMessage2.toRef(),
          "ROOT_QUERY.employees",
          "ROOT_QUERY.employeeMessages",
        ]);
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          ROOT_QUERY: {
            __typename: "Query",
          },
        });
      });
    });
  });

  describe('expiredEntities', () => {
    let dateNowSpy: any;

    test("should report all expired entities but not evict them", () => {
      cache = new InvalidationPolicyCache({
        invalidationPolicies: {
          timeToLive: 100,
        },
      });
      dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
      cache.writeQuery({
        query: employeesAndMessagesQuery,
        data: employeesAndMessagesResponse,
      });
      dateNowSpy.mockRestore();
      dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(101);

      expect(cache.extract(true, false)).toEqual({
        [employee.toRef()]: employee,
        [employee2.toRef()]: employee2,
        [employeeMessage.toRef()]: employeeMessage,
        [employeeMessage2.toRef()]: employeeMessage2,
        ROOT_QUERY: {
          __typename: "Query",
          employees: {
            __typename: "EmployeesResponse",
            data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
          },
          employeeMessages: {
            __typename: "EmployeeMessagesResponse",
            data: [
              { __ref: employeeMessage.toRef() },
              { __ref: employeeMessage2.toRef() },
            ],
          },
        },
      });
      const expiredEntityIds = cache.expiredEntities();
      expect(expiredEntityIds).toEqual([
        employee.toRef(),
        employee2.toRef(),
        employeeMessage.toRef(),
        employeeMessage2.toRef(),
        "ROOT_QUERY.employees",
        "ROOT_QUERY.employeeMessages",
      ]);
      expect(cache.extract(true, false)).toEqual({
        [employee.toRef()]: employee,
        [employee2.toRef()]: employee2,
        [employeeMessage.toRef()]: employeeMessage,
        [employeeMessage2.toRef()]: employeeMessage2,
        ROOT_QUERY: {
          __typename: "Query",
          employees: {
            __typename: "EmployeesResponse",
            data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
          },
          employeeMessages: {
            __typename: "EmployeeMessagesResponse",
            data: [
              { __ref: employeeMessage.toRef() },
              { __ref: employeeMessage2.toRef() },
            ],
          },
        },
      });
    });
  });

  describe('#activatePolicies', () => {
    beforeEach(() => {
      cache = new InvalidationPolicyCache();
    });

    describe('with no policies passed', () => {
      test('should activate all policies', () => {
        expect(cache.activePolicyEvents()).toEqual([]);
        cache.activatePolicyEvents();
        expect(cache.activePolicyEvents()).toEqual(expect.arrayContaining([
          InvalidationPolicyEvent.Read,
          InvalidationPolicyEvent.Write,
          InvalidationPolicyEvent.Evict,
        ]));
      })
    });

    describe('with policies passed', () => {
      test('should activate the provided policies', () => {
        expect(cache.activePolicyEvents()).toEqual([]);
        cache.activatePolicyEvents(InvalidationPolicyEvent.Read);
        expect(cache.activePolicyEvents()).toEqual(expect.arrayContaining([
          InvalidationPolicyEvent.Read,
        ]));
      })
    });
  });

  describe('#deactivatePolicies', () => {
    beforeEach(() => {
      cache = new InvalidationPolicyCache();
    });

    describe('with no policies passed', () => {
      test('should deactivate all policies', () => {
        cache.activatePolicyEvents();
        expect(cache.activePolicyEvents()).toEqual(expect.arrayContaining([
          InvalidationPolicyEvent.Read,
          InvalidationPolicyEvent.Write,
          InvalidationPolicyEvent.Evict,
        ]));
        cache.deactivatePolicyEvents();
        expect(cache.activePolicyEvents()).toEqual(expect.arrayContaining([]));
      })
    });

    describe('with policies passed', () => {
      test('should deactivate the provided policies', () => {
        cache.activatePolicyEvents();
        expect(cache.activePolicyEvents()).toEqual(expect.arrayContaining([
          InvalidationPolicyEvent.Read,
          InvalidationPolicyEvent.Write,
          InvalidationPolicyEvent.Evict,
        ]));
        cache.deactivatePolicyEvents(InvalidationPolicyEvent.Read);
        expect(cache.activePolicyEvents()).toEqual(expect.arrayContaining([
          InvalidationPolicyEvent.Write,
          InvalidationPolicyEvent.Evict,
        ]));
      })
    });
  });

  describe("#extract", () => {
    describe("without invalidation extracted", () => {
      beforeEach(() => {
        cache = new InvalidationPolicyCache();
        cache.writeQuery({
          query: employeesQuery,
          data: employeesResponse,
        });
      });

      test("should not include invalidation in extracted cache object", () => {
        expect(cache.extract(true, false)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
          },
        });
      });
    });

    describe("with invalidation extracted", () => {
      let dateNowSpy: any;

      beforeEach(() => {
        dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(0);
        cache = new InvalidationPolicyCache();
        cache.writeQuery({
          query: employeesQuery,
          data: employeesResponse,
        });
      });

      afterEach(() => {
        dateNowSpy.mockRestore();
      });

      test("should include invalidation in extracted cache object", () => {
        expect(cache.extract(true, true)).toEqual({
          [employee.toRef()]: employee,
          [employee2.toRef()]: employee2,
          ROOT_QUERY: {
            __typename: "Query",
            employees: {
              __typename: "EmployeesResponse",
              data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
            },
          },
          invalidation: {
            entitiesById: {
              "ROOT_QUERY.employees": {
                dataId: "ROOT_QUERY",
                typename: "EmployeesResponse",
                fieldName: "employees",
                storeFieldNames: {
                  __size: 1,
                  entries: {
                    employees: {
                      cacheTime: 0,
                    },
                  },
                },
              },
              [`Employee:${employee.id}`]: {
                dataId: `Employee:${employee.id}`,
                typename: "Employee",
                cacheTime: 0,
              },
              [`Employee:${employee2.id}`]: {
                dataId: `Employee:${employee2.id}`,
                typename: "Employee",
                cacheTime: 0,
              },
            },
          },
        });
      });
    });
  });

  describe('#init', () => {
    beforeEach(() => {
      cache = new InvalidationPolicyCache();
      cache.writeQuery({
        query: employeesQuery,
        data: employeesResponse,
      });
    });

    test('should reset the entity store watcher and entity type map along with the entity store', () => {
      const expectedEntityStore = {
        [employee.toRef()]: employee,
        [employee2.toRef()]: employee2,
        ROOT_QUERY: {
          __typename: "Query",
          employees: {
            __typename: "EmployeesResponse",
            data: [{ __ref: employee.toRef() }, { __ref: employee2.toRef() }],
          },
        },
      };

      const expectedEntityTypeMap = {
        "entitiesById": {
          [employee.toRef()]: {
            "dataId": employee.toRef(),
            "typename": "Employee",
            "cacheTime": expect.any(Number),
          },
          [employee2.toRef()]: {
            "dataId": employee2.toRef(),
            "typename": "Employee",
            "cacheTime": expect.any(Number)
          },
          "ROOT_QUERY.employees": {
            "dataId": "ROOT_QUERY",
            "typename": "EmployeesResponse",
            "fieldName": "employees",
            "storeFieldNames": {
              "__size": 1,
              "entries": {
                "employees": {
                  "cacheTime": expect.any(Number)
                }
              }
            }
          }
        },
        "entitiesByType": {
          "Employee": {
            [employee.toRef()]: {
              "dataId": employee.toRef(),
              "typename": "Employee",
              "cacheTime": expect.any(Number)
            },
            [employee2.toRef()]: {
              "dataId": employee2.toRef(),
              "typename": "Employee",
              "cacheTime": expect.any(Number)
            }
          },
          "EmployeesResponse": {
            "ROOT_QUERY.employees": {
              "dataId": "ROOT_QUERY",
              "typename": "EmployeesResponse",
              "fieldName": "employees",
              "storeFieldNames": {
                "__size": 1,
                "entries": {
                  "employees": {
                    "cacheTime": expect.any(Number)
                  }
                }
              }
            }
          }
        }
      };

      expect(cache.extract(true, false)).toEqual(expectedEntityStore);

      // @ts-ignore testing private API
      expect(cache.entityTypeMap.extract()).toEqual(
        expectedEntityTypeMap
      );

      // @ts-ignore testing private API
      cache.init();

      // The entity store and entity type map should now be cleared

      expect(cache.extract(true, false)).toEqual({});

      // @ts-ignore testing private API
      expect(cache.entityTypeMap.extract()).toEqual({
        entitiesByType: {},
        entitiesById: {},
      });

      // After writing again, the entity type map should have been synced
      cache.writeQuery({
        query: employeesQuery,
        data: employeesResponse,
      });

      expect(cache.extract(true, false)).toEqual(expectedEntityStore);

      // @ts-ignore testing private API
      expect(cache.entityTypeMap.extract()).toEqual(
        expectedEntityTypeMap
      );
    });
  });
});
