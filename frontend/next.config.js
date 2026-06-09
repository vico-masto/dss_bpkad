/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@base-ui/react"],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
