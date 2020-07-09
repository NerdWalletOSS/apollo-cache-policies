module.exports = {
  testEnvironment: "node",
  preset: "ts-jest/presets/js-with-ts",
  transformIgnorePatterns: ["/node_modules/(?!@apollo/client).+\\.js$"],
  setupFilesAfterEnv: ["jest-extended"],
};
