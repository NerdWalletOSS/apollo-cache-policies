import { useApolloClient } from "@apollo/client";
import { useEffect, useRef } from "react"
import { InvalidationPolicyCache } from "../cache";
import { generateFragmentFieldName } from "../helpers";

// Creates a field name to be used for a dynamically added field policy.
export const useFragmentTypePolicyFieldName = (): string => {
  const { current: fieldName } = useRef(generateFragmentFieldName());
  const client = useApolloClient();

  useEffect(() =>
    // @ts-ignore After the component using the hook is torn down, remove the dynamically added type policy
    // for this hook from the type policies list.
    () => delete (client.cache as InvalidationPolicyCache).policies.typePolicies.Query.fields[fieldName],
    [],
  );

  return fieldName;
}