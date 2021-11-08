import _ from "lodash";
import { v4 } from "uuid";
import { createFixture } from "./utils";

export default createFixture("EmployeeMessage", (index: number) => ({
  id: v4(),
  employee_id: v4(),
  employee_message: `Hello x${index}!`,
}));
