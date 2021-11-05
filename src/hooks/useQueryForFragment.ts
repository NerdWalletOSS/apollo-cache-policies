import { useQuery } from "@apollo/client";
import { DocumentNode } from "graphql";

export const useQueryForFragment = (query: DocumentNode, fieldName: string) => {
  const result = useQuery(query, {
    fetchPolicy: 'cache-only',
  });

  return {
    ...result,
    // The data payload for a useFragment hook should not be wrapped in the artificial
    // field name and should return the data directly.
    data: result?.data?.[fieldName]
  };
}