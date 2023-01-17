const output = {
  globalObject: "this",
};

const publicPath = process.env.WEBPACK_PUBLIC_PATH || "/pdf-select-area/";

module.exports = {
  publicPath,
  configureWebpack: {
    devServer: {
      watchOptions: {
        poll: true,
      },
    },
    output,
  },
  chainWebpack: (config) => {
    config.module.rule("svg").use("file-loader").loader("vue-svg-loader");
  },
};
