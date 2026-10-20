import{PUBLIC_SOCIAL_PREVIEWS}from'../lib/social-preview.ts';
import type { Metadata } from "next";
import "./globals.css";
import { getAuthContext } from "../lib/auth-context.ts";
import { AuthProvider } from "./auth-client";
export const metadata: Metadata = {
  title: "ThunderPlains Conference Planner | Techlahoma",
  description: "Plan ThunderPlains and InnoTech sessions, save your profile, and connect with attendees. An account-based conference planner with private agendas and notes.",
  icons: { icon: "/favicon.svg",apple:"/devyo-apple-touch.png" },
  manifest:"/manifest.webmanifest",
  appleWebApp:{capable:true,title:"Devyo",statusBarStyle:"default"},
  openGraph:{type:"website",url:PUBLIC_SOCIAL_PREVIEWS.thunderplains.url,siteName:"ThunderPlains Devyo",title:PUBLIC_SOCIAL_PREVIEWS.thunderplains.title,description:PUBLIC_SOCIAL_PREVIEWS.thunderplains.description,images:[{url:PUBLIC_SOCIAL_PREVIEWS.thunderplains.image,width:1200,height:630,type:"image/png",alt:PUBLIC_SOCIAL_PREVIEWS.thunderplains.alt}]},
  twitter:{card:"summary_large_image",title:PUBLIC_SOCIAL_PREVIEWS.thunderplains.title,description:PUBLIC_SOCIAL_PREVIEWS.thunderplains.description,images:[PUBLIC_SOCIAL_PREVIEWS.thunderplains.image]},
};
export const viewport={themeColor:"#24103b"};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><nav className="devyo-global-nav" aria-label="Main Devyo navigation"><a href="https://devyo.app/" referrerPolicy="no-referrer">Devyo home ↗</a></nav><AuthProvider publishableKey={getAuthContext().publishableKey} accountDeletedNotice={getAuthContext().accountDeletedNotice}>{children}</AuthProvider></body></html>;
}
