import { useQuery } from "@apollo/client";
import { DocumentNode } from "graphql";
import { useRef } from "react";

// A hook that subscribes to a query with useQuery and gets the data under a particular field name
// of the raw useQuery response as the new data response.
export const useGetQueryDataByFieldName = <FieldType>(query: DocumentNode, fieldName: string, options?: {
  returnPartialData?: boolean;
}): { data: FieldType[] } => {
  const emptyValue = useRef<FieldType[]>([]);
  const result = useQuery<Record<string, FieldType>>(query, {
    fetchPolicy: 'cache-only',
    returnPartialData: options?.returnPartialData,
  });

  const requiredDataResult = {
    data: (result?.data?.[fieldName] as FieldType[]) ?? emptyValue.current,
  };

  return requiredDataResult;
}