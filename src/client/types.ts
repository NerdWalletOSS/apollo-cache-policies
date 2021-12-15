import { DocumentNode } from 'graphql';
import { FragmentWhereFilter } from '../cache/types';

export type FragmentOptions = {
  fragment: DocumentNode,
  fragmentName?: string;
}

export type WatchFragmentOptions = FragmentOptions & {
  id: string;
}

export type WatchFragmentWhereOptions<FragmentType> = FragmentOptions & {
  filter?: FragmentWhereFilter<FragmentType>;
}
