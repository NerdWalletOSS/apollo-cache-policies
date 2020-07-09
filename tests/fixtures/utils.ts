import _ from "lodash";

interface toRefContext {
  [key: string]: any;
}

type FixtureGenerator = (data?: object) => Fixture;

export interface Fixture {
  [key: string]: any;
  __typename: string;
  toRef: () => string;
}

function toRef(this: toRefContext) {
  return `${this.__typename}:${this.id}`;
}

const fixtures: { [key: string]: () => FixtureGenerator } = {};

export const createFixture = (
  typename: string,
  generator: (index: number) => object
) => {
  fixtures[typename] = (): FixtureGenerator => {
    let count = 0;

    return (data?: object) => {
      count += 1;
      const fixtureObject = _.assign(generator(count), data) as Fixture;
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

  return fixtures[typename]();
};
