import "./globals.css";
import "react-toastify/dist/ReactToastify.css";
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { Providers } from "./components/Providers";
import { Header } from "./components/Header";
import { ToastContainer } from "react-toastify";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });
export const metadata: Metadata = {
  title: "CertiChain",
  description:
    "A blockchain-based certificate issuance and verification demo built with Solidity and Next.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.className}>
        <Providers>
          <Header />
          {children}
        </Providers>
        <ToastContainer position="bottom-center" />
      </body>
    </html>
  );
}
