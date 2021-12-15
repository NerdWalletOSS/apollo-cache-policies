import { ApolloLink, gql, NormalizedCacheObject } from "@apollo/client";
import _ from "lodash";
import { ApolloExtensionsClient } from "../src";
import { InvalidationPolicyCache } from "../src/cache";
import Employee, { EmployeeType } from "./fixtures/employee";

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

const [employee, employee2] = _.times(3, () => Employee());

const employeesResponse = {
  employees: {
    __typename: "EmployeesResponse",
    data: [employee, employee2],
  },
};

describe('ApolloExtensionsClient', () => {
  let client: ApolloExtensionsClient<NormalizedCacheObject>;
  let cache: InvalidationPolicyCache;

  beforeEach(() => {
    cache = new InvalidationPolicyCache({
      enableCollections: true,
    });
    client = new ApolloExtensionsClient({
      cache,
      link: ApolloLink.empty(),
    });

    cache.writeQuery({
      query: employeesQuery,
      data: employeesResponse,
    });
  });

  describe('watchFragment', () => {
    describe('with a function subscriber', () => {
      test('should emit the employee object', (done) => {
        const observable = client.watchFragment({
          fragment: gql`
            fragment EmployeeFragment on Employee {
              id
              employee_name
            }
          `,
          id: employee.toRef(),
        });

        const subscription = observable.subscribe((val) => {
          expect(val).toEqual({
            __typename: 'Employee',
            id: employee.id,
            employee_name: employee.employee_name,
          });
          // @ts-ignore Type policies is private
          expect(Object.keys(cache.policies.typePolicies.Query.fields).length).toEqual(1);
          subscription.unsubscribe();
          // @ts-ignore Type policies is private
          expect(Object.keys(cache.policies.typePolicies.Query.fields).length).toEqual(0);
          done();
        });
      });

      test('should emit updates', (done) => {
        const observable = client.watchFragment({
          fragment: gql`
            fragment EmployeeFragment on Employee {
              id
              employee_name
            }
          `,
          id: employee.toRef(),
        });

        const subscription = observable.subscribe((val: any) => {
          if (val.employee_name === 'done') {
            expect(val).toEqual({
              __typename: 'Employee',
              id: employee.id,
              employee_name: 'done',
            });

            subscription.unsubscribe();
            done();
          } else {
            expect(val).toEqual({
              __typename: 'Employee',
              id: employee.id,
              employee_name: employee.employee_name,
            });

            cache.writeFragment({
              fragment: gql`
                fragment UpdateEmployee on Employee {
                  employee_name,
                }
              `,
              id: employee.toRef(),
              data: {
                employee_name: 'done',
              },
            });
          }
        });
      });
    });

    describe('with an object subscriber', () => {
      test('should emit the employee object', (done) => {
        const observable = client.watchFragment({
          fragment: gql`
            fragment EmployeeFragment on Employee {
              id
              employee_name
            }
          `,
          id: employee.toRef(),
        });

        const subscription = observable.subscribe({
          next: (val) => {
            expect(val).toEqual({
              __typename: 'Employee',
              id: employee.id,
              employee_name: employee.employee_name,
            });
            subscription.unsubscribe();
            done();
          },
        });
      });
    });

    describe('with multiple fragments', () => {
      describe('without a fragment name provided', () => {
        test('should query for the first fragment', (done) => {
          const observable = client.watchFragment({
            fragment: gql`
              fragment EmployeeFragment on Employee {
                id
                ...OtherFragment
              }

              fragment OtherFragment on Employee {
                employee_name
              }
            `,
            id: employee.toRef(),
          });

          const subscription = observable.subscribe((val) => {
            expect(val).toEqual({
              __typename: 'Employee',
              id: employee.id,
              employee_name: employee.employee_name,
            });
            // @ts-ignore Type policies is private
            expect(Object.keys(cache.policies.typePolicies.Query.fields).length).toEqual(1);
            subscription.unsubscribe();
            // @ts-ignore Type policies is private
            expect(Object.keys(cache.policies.typePolicies.Query.fields).length).toEqual(0);
            done();
          });
        });
      });

      describe('with a fragmentName provided', () => {
        describe('with a matching fragment name', () => {
          test('should query for the fragment with the given fragment name', (done) => {
            const observable = client.watchFragment({
              fragment: gql`
                fragment OtherFragment on Employee {
                  employee_name
                }

                fragment EmployeeFragment on Employee {
                  id
                  ...OtherFragment
                }
              `,
              id: employee.toRef(),
              fragmentName: 'EmployeeFragment',
            });

            const subscription = observable.subscribe((val) => {
              expect(val).toEqual({
                __typename: 'Employee',
                id: employee.id,
                employee_name: employee.employee_name,
              });
              // @ts-ignore Type policies is private
              expect(Object.keys(cache.policies.typePolicies.Query.fields).length).toEqual(1);
              subscription.unsubscribe();
              // @ts-ignore Type policies is private
              expect(Object.keys(cache.policies.typePolicies.Query.fields).length).toEqual(0);
              done();
            });
          });
        });

        describe('without a matching fragment name', () => {
          test('should error that the given fragment could not be found', () => {
            expect(() => client.watchFragment({
              fragment: gql`
                fragment OtherFragment on Employee {
                  employee_name
                }

                fragment EmployeeFragment on Employee {
                  id
                  ...OtherFragment
                }
              `,
              id: employee.toRef(),
              fragmentName: 'MissingFragment',
            })).toThrowError('No fragment with name: MissingFragment');
          });
        });
      });
    });
  });

  describe('watchFragmentWhere', () => {
    describe('with a function subscriber', () => {
      test('should emit the employee object', (done) => {
        const observable = client.watchFragmentWhere<EmployeeType>({
          fragment: gql`
            fragment EmployeeFragment on Employee {
              id
              employee_name
            }
          `,
          filter: {
            employee_name: employee.employee_name,
          },
        });

        const subscription = observable.subscribe((val) => {
          expect(val).toEqual([{
            __typename: 'Employee',
            id: employee.id,
            employee_name: employee.employee_name,
          }]);
          subscription.unsubscribe();
          done();
        });
      });

      test('should emit updates', (done) => {
        const observable = client.watchFragmentWhere<EmployeeType>({
          fragment: gql`
            fragment EmployeeFragment on Employee {
              id
              employee_name
            }
          `,
          filter: {
            employee_name: employee.employee_name,
          },
        });

        const subscription = observable.subscribe((val: any) => {
          if (val.length === 0) {
            subscription.unsubscribe();
            done();
          } else {
            expect(val).toEqual([{
              __typename: 'Employee',
              id: employee.id,
              employee_name: employee.employee_name,
            }]);

            cache.writeFragment({
              fragment: gql`
                fragment UpdateEmployee on Employee {
                  employee_name,
                }
              `,
              id: employee.toRef(),
              data: {
                employee_name: 'done',
              },
            });
          }
        });
      });
    });
  });
});