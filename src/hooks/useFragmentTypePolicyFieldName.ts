import { useApolloClient } from "@apollo/client";
import { useEffect, useRef } from "react"
import { InvalidationPolicyCache } from "../cache";
import { generateFieldName } from "../helpers";

export const useFragmentTypePolicyFieldName = (): string => {
  const { current: fieldName } = useRef(generateFieldName());
  const client = useApolloClient();

  useEffect(() =>
    // @ts-ignore Type policies is a private API
    () => delete (client.cache as InvalidationPolicyCache).policies.typePolicies.Query.fields[fieldName],
    [],
  );

  return fieldName;
}