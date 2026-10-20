import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Librerías de correo (IMAP/SMTP) se cargan tal cual en Node, sin empaquetar
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer", "mammoth"],
  experimental: {
    // Permite subir Excel, fotos de avatar y adjuntos del chat mediante Server Actions
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
