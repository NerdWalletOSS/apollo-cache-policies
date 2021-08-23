import { DocumentNode } from 'graphql';

export type WatchFragmentOptions = {
  fragment: DocumentNode,
  id: string;
}

export type WatchFragmentWhereOptions<FragmentType> = {
  fragment: DocumentNode;
  filters: Partial<Record<keyof FragmentType, any>>;
}
