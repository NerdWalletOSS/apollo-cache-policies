import assign from "lodash/assign";

interface toRefContext {
  [key: string]: any;
}

type FixtureGenerator<T = any> = (data?: object) => Fixture<T>;

export type Fixture<T> = T & {
  [key: string]: any;
  __typename: string;
  toRef: () => string;
}

function toRef(this: toRefContext) {
  return `${this.__typename}:${this.id}`;
}

const fixtures: { [key: string]: () => FixtureGenerator } = {};

export const createFixture = <T>(
  typename: string,
  generator: (index: number) => object
): FixtureGenerator<T> => {
  fixtures[typename] = (): FixtureGenerator => {
    let count = 0;

    return (data?: object) => {
      count += 1;
      const fixtureObject = assign(generator(count), data) as Fixture<T>;
      fixtureObject.__typename = typename;
      fixtureObject.toRef = toRef;
      Object.defineProperty(fixtureObject, "toRef", {
        configurable: false,
        enumerable: false,
        get: () => {
          return toRef;
        },
      });
      return fixtureObject;
    };
  };

  const fixture = fixtures[typename] as () => FixtureGenerator<T>;

  return fixture();
};
