import { useApolloClient } from "@apollo/client";
import { uuid } from 'uuidv4';
import { useEffect, useRef } from "react"
import { InvalidationPolicyCache } from "../cache";

export const useFragmentTypePolicyFieldName = (): string => {
  const { current: fieldName } = useRef(uuid());

  useEffect(() => {
    const client = useApolloClient();
    // @ts-ignore Type policies is a private API
    delete (client.cache as InvalidationPolicyCache).policies.typePolicies[fieldName];
  }, []);

  return fieldName;
}