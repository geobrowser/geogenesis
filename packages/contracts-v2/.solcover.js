module.exports = {
  istanbulReporter: ['html', 'lcov'],
  providerOptions: {
    privateKey: process.env.PRIVATE_KEY,
  },
  skipFiles: ['test'],
};
