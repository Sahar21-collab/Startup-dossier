"use client";

import { useState } from "react";

const PLACEHOLDER_EMAIL = "your.email@example.com";

const PROJECTS = [
  {
    title: "Lorem ipsum dolor sit amet",
    text: "Consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  },
  {
    title: "Ut enim ad minim veniam",
    text: "Quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute.",
  },
  {
    title: "Duis aute irure dolor",
    text: "In reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint.",
  },
  {
    title: "Excepteur sint occaecat",
    text: "Cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  },
];

const LOGOS = ["Logo", "Logo", "Logo", "Logo", "Logo", "Logo"];

export default function Projects() {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(PLACEHOLDER_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="portfolio">
      <section className="hero">
        <div className="avatar" role="img" aria-label="Photo placeholder">
          <span>Photo</span>
        </div>
        <p className="hero-text">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.
        </p>
        <button type="button" className="ghost-button" onClick={copyEmail}>
          {copied ? "Copied" : "Copy email"}
        </button>
      </section>

      <section className="logos">
        <p className="logos-label">Lorem ipsum dolor sit</p>
        <ul className="logo-row">
          {LOGOS.map((logo, i) => (
            <li className="logo-box" key={i}>{logo}</li>
          ))}
        </ul>
      </section>

      <section className="work">
        <h2 className="work-title">Recent work</h2>

        {PROJECTS.map((project) => (
          <article className="project" key={project.title}>
            <h3 className="project-title">{project.title}</h3>
            <p className="project-text">{project.text}</p>
            <span className="project-link">View project →</span>
            <div className="image-placeholder" role="img" aria-label="Project image placeholder">
              <span>Image</span>
            </div>
          </article>
        ))}
      </section>

      <section className="contact">
        <h2 className="work-title">Get in touch</h2>
        <p className="project-text">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
        <button type="button" className="ghost-button" onClick={copyEmail}>
          {copied ? "Copied" : "Copy email"}
        </button>
      </section>
    </main>
  );
}
