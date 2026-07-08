export const metadata = { title: "AT&T Family Split", description: "Auto-split the family AT&T bill" };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
