import { useRef } from 'react';
import { isFunction } from 'lodash-es';

export function useOnce<T>(value: T | (() => T)): T {
  const valueRef = useRef<T>();
  const hasCachedValueRef = useRef(false);
  if (!hasCachedValueRef.current) {
    if (isFunction(value)) {
      valueRef.current = value();
    } else {
      valueRef.current = value;
    }
    hasCachedValueRef.current = true;
  }
  return valueRef.current as T;
}