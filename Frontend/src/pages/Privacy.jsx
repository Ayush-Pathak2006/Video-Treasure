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
        users can like and comment on videos, keep private playlists and find the videos they watched again. This
        policy explains what we store, why, and for how long.
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
          never stored in readable form. With Google sign-in, we receive your name, email address and Google account
          id. We don&apos;t get access to your YouTube account or any other Google data.
        </li>
        <li>
          <strong>Your session.</strong> Cookies that keep you logged in. They are removed when you log out.
        </li>
        <li>
          <strong>Your likes and playlists.</strong> The videos you like and the playlists you create. Playlists are
          private: only you can see them.
        </li>
        <li>
          <strong>Your watch history.</strong> The videos you watch while logged in, and when, so you can find them
          again and get better suggestions. You can remove videos, clear it or pause it at any time on your History
          page.
        </li>
        <li>
          <strong>Your comments.</strong> The comments you post, with your name and the time, and the comments you
          like. Comments are public; you can edit or delete yours at any time.
        </li>
        <li>
          <strong>Public video information.</strong> We keep a copy of public details of the videos shown on the site,
          such as titles, descriptions, thumbnails, channel names and view counts. YouTube information is refreshed
          regularly, as YouTube&apos;s policies require, and videos that are no longer available are removed together
          with any likes, playlist entries, comments or watch history for them.
        </li>
        <li>
          <strong>Keeping the service fair.</strong> To protect the site from abuse, we use your account or, if you
          aren&apos;t logged in, your IP address to limit how often some features can be used. This information is kept
          only for a short time.
        </li>
        <li>
          <strong>Search activity.</strong> To find trending topics, we keep the searches made on the site for up to 7
          days, together with a code derived from your IP address (never the address itself).
        </li>
        <li>
          <strong>Server logs.</strong> Our hosting providers keep technical logs that can include IP addresses.
        </li>
        <li>
          <strong>Your browser.</strong> The site may save small pieces of information in your browser, such as a search
          you started before logging in, so it can pick up where you left off.
        </li>
      </ul>
      <p>
        We don&apos;t sell your data, show ads of our own, or use tracking cookies of our own. The YouTube and Dailymotion
        players are run by those companies and may show their own ads and set their own cookies.
      </p>

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
        <li>Hosting, database and email providers that run the site and send account emails for us.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          You can remove likes, delete playlists, edit or delete your comments, and remove, clear or pause your watch
          history at any time.
        </li>
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
