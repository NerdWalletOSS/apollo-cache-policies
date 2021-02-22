import { v4 as uuid } from "uuid";
import { createFixture } from "./utils";

export default createFixture("EmployeeMessage", (index: number) => ({
  id: uuid(),
  employee_id: uuid(),
  employee_message: `Hello x${index}!`,
}));
