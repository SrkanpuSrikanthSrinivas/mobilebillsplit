/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdfjs-dist legacy build needs canvas disabled in server bundles
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};
export default nextConfig;
