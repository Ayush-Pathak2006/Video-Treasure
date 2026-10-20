import React from "react";
import { Link } from "react-router-dom";
import { SITE_NAME, YOUTUBE_TERMS_URL } from "../config/site";

// On every page (App.jsx). YouTube's Developer Policies (III.A) require the privacy policy to be easy to reach
// at all times and a link to the YouTube Terms of Service.
function Footer() {
  return (
    <footer className="border-t border-white/10 bg-gray-900/30 backdrop-blur-sm px-4 py-6 text-sm text-white/60">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <p>
          {SITE_NAME} uses YouTube API Services. Videos belong to their owners.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link to="/privacy" className="hover:text-white transition-colors">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-white transition-colors">
            Terms of Service
          </Link>
          <a href={YOUTUBE_TERMS_URL} target="_blank" rel="noopener" className="hover:text-white transition-colors">
            YouTube Terms of Service
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
