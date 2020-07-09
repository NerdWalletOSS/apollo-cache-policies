import _ from "lodash";
import { v4 as uuid } from "uuid";
import { createFixture } from "./utils";

export default createFixture("Employee", (index: number) => ({
  id: uuid(),
  employee_name: `Test Employee ${index}`,
  employee_salary: _.random(50000, 150000),
  employee_age: _.random(18, 100),
}));
