import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ThunderPlains Conference Planner | Techlahoma",
  description: "Plan ThunderPlains and InnoTech sessions, save your profile, and connect with attendees. A private test planner for Techlahoma.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
