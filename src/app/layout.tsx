import type { ReactNode } from "react";

export const metadata = {
  title: "Reelwire",
  description: "The newswire that ships reels.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
