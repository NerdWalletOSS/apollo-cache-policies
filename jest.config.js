module.exports = {
  testEnvironment: "node",
  preset: "ts-jest/presets/js-with-ts",
  transformIgnorePatterns: ["/node_modules/(?!@apollo/client|lodash|ts-invariant).+\\.js$"],
  setupFilesAfterEnv: ["jest-extended"],
};
