import { ReactiveVar } from "@apollo/client";
import { cachedReactiveVarTypename, makeCachedVar } from "../src/cache/ReactiveVarsCache";
import InvalidationPolicyCache from "../src/cache/InvalidationPolicyCache";

describe('CachedReactiveVars', () => {
  let cache: InvalidationPolicyCache;
  let rv: ReactiveVar<any>;

  beforeEach(() => {
    cache = new InvalidationPolicyCache();
    rv = makeCachedVar<boolean>('test', false);
  });

  test('should cache value changes', () => {
    expect(cache.extract(true, false)).toEqual({
      "CachedReactiveVar:test": {
        __typename: cachedReactiveVarTypename,
        id: 'test',
        value: false,
      },
      __META: {
        extraRootIds: ['CachedReactiveVar:test']
      }
    });
    rv(true);
    expect(cache.extract(true, false)).toEqual({
      "CachedReactiveVar:test": {
        __typename: cachedReactiveVarTypename,
        id: 'test',
        value: true,
      },
      __META: {
        extraRootIds: ['CachedReactiveVar:test']
      }
    });
    rv(false);
    expect(cache.extract(true, false)).toEqual({
      "CachedReactiveVar:test": {
        __typename: cachedReactiveVarTypename,
        id: 'test',
        value: false,
      },
      __META: {
        extraRootIds: ['CachedReactiveVar:test']
      }
    });
  });

  test('should be initialized with the existing cached value', () => {
    rv(true);

    const rv2 = makeCachedVar('test', false);

    expect(rv2()).toEqual(true);
  });

  describe('on restore', () => {
    test('should update reactive reactive vars to their updated cache values', () => {
      expect(rv()).toEqual(false);
      cache.restore({
        "CachedReactiveVar:test": {
          __typename: cachedReactiveVarTypename,
          id: 'test',
          value: true,
        },
        __META: {
          extraRootIds: ['CachedReactiveVar:test']
        }
      });
      expect(rv()).toEqual(true);
    });
  });

  describe('on reset', () => {
    test('should reset reactive reactive vars to their defaults values', () => {
      expect(rv()).toEqual(false);
      rv(true);
      expect(rv()).toEqual(true);
      cache.reset();
      expect(rv()).toEqual(false);
    });
  });
});