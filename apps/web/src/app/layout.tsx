import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Campaign Messaging",
  description: "Personalized message platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
