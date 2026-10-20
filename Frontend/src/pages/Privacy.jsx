import React from "react";
import { Link } from "react-router-dom";
import LegalPage, { ContactLine } from "../components/LegalPage";
import {
  DAILYMOTION_PRIVACY_URL,
  GOOGLE_PERMISSIONS_URL,
  GOOGLE_PRIVACY_URL,
  SITE_NAME,
  YOUTUBE_TERMS_URL,
} from "../config/site";

function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {SITE_NAME} is a video search site. One search box shows videos from YouTube and Dailymotion, and logged-in
        users can like videos and keep private playlists. This policy explains what we store, why, and for how long.
        By using {SITE_NAME} you agree to this policy.
      </p>

      <h2>YouTube API Services</h2>
      <p>
        {SITE_NAME} uses YouTube API Services to search YouTube and to show video details. YouTube videos play in
        YouTube&apos;s own embedded player. Your use of YouTube content is also covered by the{" "}
        <a href={GOOGLE_PRIVACY_URL} target="_blank" rel="noopener">
          Google Privacy Policy
        </a>{" "}
        and the{" "}
        <a href={YOUTUBE_TERMS_URL} target="_blank" rel="noopener">
          YouTube Terms of Service
        </a>
        .
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account.</strong> Your name, username and email address. With email sign-up, your password is
          stored only as a one-way hash. With Google sign-in, we receive your name, email address and Google account
          id. We don&apos;t get access to your YouTube account or any other Google data.
        </li>
        <li>
          <strong>Your session.</strong> Two cookies that keep you logged in. They can&apos;t be read by scripts on the
          page and are cleared when you log out.
        </li>
        <li>
          <strong>Your likes and playlists.</strong> The videos you like and the playlists you create. Playlists are
          private: only you can see them.
        </li>
        <li>
          <strong>Public video information.</strong> To keep searches fast and within YouTube&apos;s limits, we keep a
          shared copy of public video details: titles, descriptions, thumbnails, channel names, and view and like
          counts. YouTube data is refreshed or deleted within 30 days. Videos that are deleted, made private or can no
          longer be embedded are removed, along with likes and playlist entries that point to them.
        </li>
        <li>
          <strong>Fair-use limits.</strong> To stop one visitor from using up everyone&apos;s YouTube searches, we count
          searches per account or, if you aren&apos;t logged in, per IP address. These counters are deleted after 2 days
          without use.
        </li>
        <li>
          <strong>Search activity.</strong> To spot trending topics, we record first-page searches with the search text
          and a one-way hash of your IP address, never the address itself. These records are deleted after 7 days.
        </li>
        <li>
          <strong>Server logs.</strong> Our hosting providers keep technical logs that can include IP addresses.
        </li>
        <li>
          <strong>Your browser.</strong> If you choose to log in from a search, your browser remembers that search for
          the current tab, so it can run again after you log in.
        </li>
      </ul>
      <p>We don&apos;t show ads, sell your data, or use tracking cookies of our own.</p>

      <h2>Services we use</h2>
      <ul>
        <li>
          Google: YouTube API Services, the YouTube player and Google sign-in (
          <a href={GOOGLE_PRIVACY_URL} target="_blank" rel="noopener">
            Google Privacy Policy
          </a>
          ).
        </li>
        <li>
          Dailymotion: its API and player (
          <a href={DAILYMOTION_PRIVACY_URL} target="_blank" rel="noopener">
            Dailymotion Privacy Policy
          </a>
          ).
        </li>
        <li>Render and Vercel host the site, MongoDB Atlas stores the data, and Brevo sends account emails.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>You can remove likes and delete playlists at any time.</li>
        <li>
          To have your account and everything linked to it deleted, contact us (below). We delete it within 7 days.
        </li>
        <li>
          If you signed in with Google, you can revoke {SITE_NAME}&apos;s access at any time on the{" "}
          <a href={GOOGLE_PERMISSIONS_URL} target="_blank" rel="noopener">
            Google security settings page
          </a>
          .
        </li>
      </ul>

      <h2>Changes and contact</h2>
      <p>
        If this policy changes, we update the date at the top. Questions or complaints: <ContactLine />. See also our{" "}
        <Link to="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}

export default Privacy;
