import React from "react";
import { Link } from "react-router-dom";
import LegalPage, { ContactLine } from "../components/LegalPage";
import { DAILYMOTION_TERMS_URL, SITE_NAME, YOUTUBE_TERMS_URL } from "../config/site";

function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        By using {SITE_NAME}, you agree to these terms and to our <Link to="/privacy">Privacy Policy</Link>. Because{" "}
        {SITE_NAME} uses YouTube API Services, you also agree to be bound by the{" "}
        <a href={YOUTUBE_TERMS_URL} target="_blank" rel="noopener">
          YouTube Terms of Service
        </a>
        . Dailymotion videos are covered by the{" "}
        <a href={DAILYMOTION_TERMS_URL} target="_blank" rel="noopener">
          Dailymotion Terms of Use
        </a>
        .
      </p>

      <h2>The service</h2>
      <p>
        {SITE_NAME} helps you find videos hosted on YouTube and Dailymotion. We don&apos;t host any videos: they play in
        the platforms&apos; own embedded players, and all videos, titles and thumbnails belong to their owners.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate details when you sign up, and keep your password to yourself.</li>
        <li>You are responsible for what happens under your account.</li>
        <li>You can ask us to delete your account at any time (see the Privacy Policy).</li>
      </ul>

      <h2>Fair use</h2>
      <ul>
        <li>To keep {SITE_NAME} available for everyone, we may limit how often some features can be used.</li>
        <li>
          Don&apos;t scrape the site, send automated requests, or try to get around these limits. We may block access
          that does.
        </li>
      </ul>

      <h2>No warranty</h2>
      <p>
        {SITE_NAME} is provided as it is, without guarantees that it will always be available or that results will be
        complete. To the extent the law allows, we aren&apos;t liable for losses that come from using it.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will change the date at the top when we do. Using the site after a change means
        you accept the new terms. Questions: <ContactLine />.
      </p>
    </LegalPage>
  );
}

export default Terms;
