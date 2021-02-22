import { random as _random } from 'lodash-es';
import { v4 as uuid } from "uuid";
import { createFixture } from "./utils";

export default createFixture("Employee", (index: number) => ({
  id: uuid(),
  employee_name: `Test Employee ${index}`,
  employee_salary: _random(50000, 150000),
  employee_age: _random(18, 100),
}));
