import type { Metadata } from "next";
import { DevPersonaSwitcher } from "@/components/DevPersonaSwitcher";

export const metadata: Metadata = {
  title: "Campaign Messaging",
  description: "Personalized message platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <DevPersonaSwitcher />
      </body>
    </html>
  );
}
