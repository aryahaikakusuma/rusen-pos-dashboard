import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ada package-lock.json lain di C:\Users\user, dan Turbopack sempat memilih
  // direktori itu sebagai workspace root. Dikunci ke folder proyek supaya
  // penelusuran berkas build tidak melebar ke seluruh home directory.
  turbopack: {
    root: path.resolve(),
  },
};

export default nextConfig;
