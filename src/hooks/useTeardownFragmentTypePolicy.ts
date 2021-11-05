import { useApolloClient } from "@apollo/client";
import { useEffect } from "react"
import { InvalidationPolicyCache } from "../cache";

export const useTeardownFragmentTypePolicy = (fieldName: string) => {
  useEffect(() => {
    if (fieldName) {
      const client = useApolloClient();
      // @ts-ignore Type policies is a private API
      delete (client.cache as InvalidationPolicyCache).policies.typePolicies[fieldName];
    }
  }, [fieldName]);
}