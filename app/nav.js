"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Replace with your own LinkedIn page address.
const LINKEDIN_URL = "https://www.linkedin.com/";

const TABS = [
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About me" },
  { href: "/reading", label: "What I read" },
  { href: "/", label: "Start-up stories" },
  { href: "/news", label: "Tech news" },
  { href: "/market-news", label: "Market news" },
];

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.64h.05c.53-.95 1.83-1.95 3.76-1.95 4.02 0 4.76 2.5 4.76 5.76V21h-4v-5.5c0-1.31-.02-3-1.9-3-1.9 0-2.19 1.42-2.19 2.9V21H9z" />
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState(false);

  // Close the phone menu whenever the page changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Turn the bar into a floating pill once the page is scrolled.
  useEffect(() => {
    const onScroll = () => setFloating(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={floating ? "nav-bar nav-bar-floating" : "nav-bar"}>
      <div className="nav-inner">
        <Link href="/" className="brand">Sahar Rouhani</Link>

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

        <div className="nav-actions">
          <a
            className="social-link"
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <LinkedInIcon />
          </a>

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
        </div>
      </div>
    </header>
  );
}
