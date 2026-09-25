import "./globals.css";
import Nav from "./nav";

export const metadata = {
  title: "Startup Stories",
  description: "Search a startup and its founder, and follow recent tech news.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <div className="content-box">{children}</div>
      </body>
    </html>
  );
}
