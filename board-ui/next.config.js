/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:9876/api/:path*' },
      { source: '/ws', destination: 'http://localhost:9876/ws' },
    ];
  },
};

module.exports = nextConfig;
