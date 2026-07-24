/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // The Anthropic SDK's credential-file helpers dynamically import
      // node:fs / node:path behind a `typeof process === 'undefined'`
      // guard, so they never execute in the browser (we pass an explicit
      // BYOK apiKey). Webpack still tries to resolve the node: scheme
      // statically — strip the prefix and stub the modules out.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
