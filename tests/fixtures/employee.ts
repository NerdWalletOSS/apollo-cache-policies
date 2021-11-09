import _ from "lodash";
import { v4 } from "uuid";
import { createFixture } from "./utils";

export interface EmployeeType {
  id: string,
  employee_name: string;
  employee_salary: number;
  employee_age: number;
}

export default createFixture<EmployeeType>("Employee", (index: number) => ({
  id: v4(),
  employee_name: `Test Employee ${index}`,
  employee_salary: _.random(50000, 150000),
  employee_age: _.random(18, 100),
}));
