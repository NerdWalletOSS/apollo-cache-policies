import { DocumentNode } from 'graphql';
import { Reference } from "@apollo/client/core";

export type WatchFragmentOptions = {
  fragment: DocumentNode,
  id: string;
}

export type WatchFragmentWhereOptions<FragmentType> = {
  fragment: DocumentNode;
  filter: Partial<Record<keyof FragmentType, any>> | ((__ref: Reference) => boolean);
}
