import { useQuery } from "@apollo/client";
import { DocumentNode } from "graphql";

export const useQueryForFragment = <FragmentType>(query: DocumentNode, fieldName: string) => {
  const result = useQuery<Record<string, FragmentType>>(query, {
    fetchPolicy: 'cache-only',
  });

  const requiredDataResult = {
    ...result,
    // The data payload for a useFragment hook should not be wrapped in the artificial
    // field name and should return the data directly.
    data: result?.data?.[fieldName],
  };

  type RequiredDataResult = typeof requiredDataResult & { data: FragmentType };
  return requiredDataResult as RequiredDataResult;
}