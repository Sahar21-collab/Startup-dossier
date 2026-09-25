"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About me" },
  { href: "/reading", label: "What I read" },
  { href: "/", label: "Start-up stories" },
  { href: "/news", label: "Tech news" },
  { href: "/market-news", label: "Market news" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="nav-bar">
      <nav className="nav" aria-label="Main menu">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={active ? "nav-link nav-link-active" : "nav-link"}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
