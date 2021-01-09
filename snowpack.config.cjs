// Snowpack Configuration File
// See all supported options: https://www.snowpack.dev/#configuration

/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  mount: {
    src: "/",
    data: "/data"
  },
  // plugins: [],
  // installOptions: {},
  // devOptions: {},
  buildOptions: {
    out: 'dist',
    clean: true
  },
  experiments: {
    optimize: {
      bundle: true,
      minify: true,
      target: 'es2018'
    }
  }
};
