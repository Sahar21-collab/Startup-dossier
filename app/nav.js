"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [open, setOpen] = useState(false);

  // Close the phone menu whenever the page changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="nav-bar">
      <div className="nav-inner">
        <Link href="/" className="brand">Sahar Rouhani</Link>

        <button
          type="button"
          className="nav-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="main-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? "✕" : "☰"}
        </button>

        <nav
          id="main-menu"
          className={open ? "nav nav-open" : "nav"}
          aria-label="Main menu"
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={active ? "nav-link nav-link-active" : "nav-link"}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
