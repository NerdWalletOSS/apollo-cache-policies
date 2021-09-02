import { DocumentNode } from 'graphql';
import { FragmentWhereFilter } from '../cache/types';

export type WatchFragmentOptions = {
  fragment: DocumentNode,
  id: string;
}

export type WatchFragmentWhereOptions<FragmentType> = {
  fragment: DocumentNode;
  filter?: FragmentWhereFilter<FragmentType>;
}
