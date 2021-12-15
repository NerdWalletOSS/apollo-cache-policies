import { QueryHookOptions } from "@apollo/client";

export type FragmentHookOptions = Pick<QueryHookOptions, 'onCompleted' | 'onError' | 'skip' | 'returnPartialData' | 'errorPolicy'> & {
  fragmentName?: string;
};