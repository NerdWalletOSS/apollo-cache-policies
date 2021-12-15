import { useQuery } from "@apollo/client";
import { DocumentNode } from "graphql";
import { FragmentHookOptions } from "./types";

interface UseQueryDataByFieldNameType {
  query: DocumentNode;
  fieldName: string;
  options: FragmentHookOptions;
}

// A hook that subscribes to a query with useQuery and gets the data under a particular field name
// of the raw useQuery response as the new data response.
export const useQueryDataByFieldName = <ResultFieldDataType>({ query, fieldName, options }: UseQueryDataByFieldNameType) => {
  const result = useQuery<Record<string, ResultFieldDataType>>(query, {
    ...options,
    fetchPolicy: 'cache-only',
  });

  const requiredDataResult = {
    ...result,
    data: result?.data?.[fieldName],
  };

  type RequiredDataResult = typeof requiredDataResult & { data: ResultFieldDataType };
  return requiredDataResult as RequiredDataResult;
}