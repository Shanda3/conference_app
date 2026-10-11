import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  async headers(){return [{source:"/share/:path*",headers:[
    {key:"Cache-Control",value:"private, no-store, max-age=0"},
    {key:"Referrer-Policy",value:"no-referrer"},
    {key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"},
  ]}]},
};
export default nextConfig;
