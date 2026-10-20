import React from "react";
import { Link } from "react-router-dom";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from "../config/site";

// Layout for /privacy and /terms: a readable column of text in the app's translucent style.
function LegalPage({ title, children }) {
  return (
    <div className="min-h-screen px-4 py-16 sm:py-24">
      <article className="max-w-3xl mx-auto p-6 sm:p-10 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm text-white/80 leading-relaxed space-y-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:pt-2 [&_a]:text-purple-300 [&_a]:underline [&_a:hover]:text-white [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2">
        <header className="space-y-2">
          <Link to="/" className="text-sm no-underline">
            ← Back to Video Treasure
          </Link>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white">{title}</h1>
          <p className="text-sm text-white/50">Last updated: {LEGAL_LAST_UPDATED}</p>
        </header>
        {children}
      </article>
    </div>
  );
}

// How to reach the operator. Shows a visible placeholder until CONTACT_EMAIL is filled in (src/config/site.js).
export function ContactLine() {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  ) : (
    <span className="text-yellow-300">[contact email: set CONTACT_EMAIL in src/config/site.js]</span>
  );
}

export default LegalPage;
