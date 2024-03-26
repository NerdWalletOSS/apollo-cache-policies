import { useApolloClient } from "@apollo/client";
import { useEffect, useMemo } from "react"
import { InvalidationPolicyCache } from "../cache";
import { generateFragmentFieldName } from "../helpers";
import { usePrevious } from "./utils";

// Creates a field name to be used for a dynamically added field policy.
export const useFragmentTypePolicyFieldName = ({
  fragmentName,
}: {
  fragmentName?: string;
} = {}): string => {
  const fieldName = useMemo(() => generateFragmentFieldName({ fragmentName }), [fragmentName]);
  const prevFieldName = usePrevious(fieldName);
  const client = useApolloClient();

  useEffect(() =>
    () => {
      // @ts-ignore After the component using the hook is torn down, remove the dynamically added type policy
      // for this hook from the type policies list.
      delete (client.cache as InvalidationPolicyCache).policies.typePolicies.Query.fields[prevFieldName];
    },
    [fieldName, prevFieldName],
  );

  return fieldName;
}