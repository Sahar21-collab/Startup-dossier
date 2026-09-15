import "./globals.css";

export const metadata = {
  title: "Startup Dossier",
  description: "Type a startup and its founder to get a clear, sourced summary.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
