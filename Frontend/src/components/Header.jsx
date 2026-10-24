import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AppContext";
import { getInitial } from "../utils/format";
import { primaryButtonClass, secondaryButtonClass } from "./buttonStyles";

// The bar gets its shadow once the page has scrolled past this.
const SHADOW_AFTER_PX = 8;

// 20 px outline icons.
const Icon = ({ children }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5 shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const HeartIcon = () => (
  <Icon>
    <path d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 20.25l-7.682-7.682a4.5 4.5 0 010-6.364z" />
  </Icon>
);

const PlaylistIcon = () => (
  <Icon>
    <path d="M4 6h12M4 11h12M4 16h7" />
    <path d="M15 14v6l5-3z" />
  </Icon>
);

const HistoryIcon = () => (
  <Icon>
    <path d="M3 12a9 9 0 103-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

const LogOutIcon = () => (
  <Icon>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
  </Icon>
);

const MenuIcon = ({ open }) => <Icon>{open ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</Icon>;

// A logged-in user's pages, in the desktop bar and in the phone panel.
const NAV_LINKS = [
  { to: "/liked-videos", label: "Liked videos", icon: <HeartIcon /> },
  { to: "/playlists", label: "Playlists", icon: <PlaylistIcon /> },
  { to: "/history", label: "History", icon: <HistoryIcon /> },
];

// NavLink also counts the pages under a link as active (/playlists/:id under Playlists) and sets aria-current.
const linkStateClass = isActive => (isActive ? "bg-white/20 text-white" : "text-white/70 hover:text-white hover:bg-white/10");

const Avatar = ({ name }) => (
  <span
    className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white"
    aria-hidden="true"
  >
    {getInitial(name)}
  </span>
);

const LogoutRow = ({ onLogout, state, className }) => (
  <>
    <button
      type="button"
      onClick={onLogout}
      disabled={state === "pending"}
      className={`w-full flex items-center gap-3 rounded-lg px-3 text-left text-red-300 hover:bg-red-500/10 disabled:opacity-60 transition-colors ${className}`}
    >
      <LogOutIcon />
      {state === "pending" ? "Logging out…" : "Log out"}
    </button>
    {state === "failed" && (
      <p role="alert" className="px-3 py-2 text-sm text-red-300">
        Couldn&apos;t log out. Try again.
      </p>
    )}
  </>
);

/**
 * The bar on every page (rendered once, in App.jsx). Sticky, so it takes its own space and pages need no top offset.
 * From md up: the logo, a logged-in user's links and the account menu, or Log in and Sign up. On phones: the logo
 * and one button (the avatar, or ☰ when logged out) that opens a full-width panel with everything.
 */
function Header() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(() => window.scrollY > SHADOW_AFTER_PX);
  // { name: "account" | "mobile", pathname }. A menu counts as open only on the page it was opened on, so a route
  // change closes it without an effect.
  const [openMenu, setOpenMenu] = useState(null);
  const [logoutState, setLogoutState] = useState("idle"); // idle | pending | failed
  const accountButtonRef = useRef(null);
  const accountMenuRef = useRef(null);
  const mobileButtonRef = useRef(null);
  const mobilePanelRef = useRef(null);

  const menu = openMenu?.pathname === location.pathname ? openMenu.name : null;

  // React skips the update when the value is unchanged, so this only re-renders when the page crosses the line.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SHADOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // An open menu closes on Escape (focus goes back to its button) and on a press anywhere outside it.
  useEffect(() => {
    if (!menu) return undefined;

    const button = menu === "account" ? accountButtonRef.current : mobileButtonRef.current;
    const panel = menu === "account" ? accountMenuRef.current : mobilePanelRef.current;

    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      setOpenMenu(null);
      button?.focus();
    };
    const onPointerDown = event => {
      if (panel?.contains(event.target) || button?.contains(event.target)) return;
      setOpenMenu(null);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menu]);

  const toggleMenu = name => {
    setLogoutState("idle");
    setOpenMenu(menu === name ? null : { name, pathname: location.pathname });
  };

  // The menu stays open while the request runs. If it fails, the session cookie is still there, so the user stays
  // logged in and the menu says so.
  const handleLogout = async () => {
    setLogoutState("pending");

    try {
      await logout();
      setOpenMenu(null);
      setLogoutState("idle");
    } catch {
      setLogoutState("failed");
    }
  };

  const renderLinks = rowClass =>
    NAV_LINKS.map(({ to, label, icon }) => (
      <NavLink key={to} to={to} className={({ isActive }) => `${rowClass} ${linkStateClass(isActive)}`}>
        {icon}
        {label}
      </NavLink>
    ));

  return (
    <header className={`sticky top-0 z-50 h-16 transition-shadow ${scrolled ? "shadow-lg shadow-black/20" : ""}`}>
      {/* The bar's frosted background is a layer of its own. A backdrop-filter on the header itself would make it the
          menus' backdrop root, and their blur would no longer reach the page under them (its text showed through). */}
      <div className="absolute inset-0 -z-10 border-b border-white/10 bg-gray-900/60 backdrop-blur-md" aria-hidden="true" />
      <div className="container mx-auto px-4 h-full flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 h-11 shrink-0">
          <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md shadow-purple-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-0.5" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M7 4.5v15l12.5-7.5z" stroke="white" strokeWidth={2} strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 text-transparent bg-clip-text">
            Video Treasure
          </span>
        </Link>

        <div className="flex items-center gap-2 min-w-0">
          {loading ? (
            // The session check is still running: hold the avatar's place, so Log in / Sign up don't flash for
            // logged-in users.
            <span className="h-9 w-9" aria-hidden="true" />
          ) : user ? (
            <>
              <nav aria-label="Main" className="hidden md:flex items-center gap-1">
                {renderLinks("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors")}
              </nav>

              <div className="relative hidden md:block">
                <button
                  ref={accountButtonRef}
                  type="button"
                  onClick={() => toggleMenu("account")}
                  aria-expanded={menu === "account"}
                  aria-controls="account-menu"
                  aria-label="Account menu"
                  className="flex items-center gap-1 rounded-full p-0.5 pr-2 hover:bg-white/10 transition-colors"
                >
                  <Avatar name={user.fullName} />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-4 w-4 text-white/70 transition-transform ${menu === "account" ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {/* Always rendered (hidden while closed), so aria-controls always points at something. */}
                <div
                  ref={accountMenuRef}
                  id="account-menu"
                  hidden={menu !== "account"}
                  className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-gray-900/95 backdrop-blur-md shadow-2xl shadow-purple-500/10 p-2"
                >
                  <div className="px-3 py-2">
                    <p className="font-semibold truncate">{user.fullName}</p>
                    <p className="text-sm text-white/60 truncate">{user.email}</p>
                  </div>
                  <div className="my-1 h-px bg-white/10" />
                  <LogoutRow onLogout={handleLogout} state={logoutState} className="py-2 text-sm" />
                </div>
              </div>
            </>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Link to="/login" className={`${primaryButtonClass} px-4 py-2 text-sm`}>
                Log in
              </Link>
              <Link to="/register" className={`${secondaryButtonClass} px-4 py-2 text-sm`}>
                Sign up
              </Link>
            </div>
          )}

          {!loading && (
            <button
              ref={mobileButtonRef}
              type="button"
              onClick={() => toggleMenu("mobile")}
              aria-expanded={menu === "mobile"}
              aria-controls="mobile-menu"
              aria-label="Open menu"
              className="md:hidden h-11 w-11 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors"
            >
              {user ? <Avatar name={user.fullName} /> : <MenuIcon open={menu === "mobile"} />}
            </button>
          )}
        </div>
      </div>

      {!loading && (
        <div
          ref={mobilePanelRef}
          id="mobile-menu"
          hidden={menu !== "mobile"}
          className="md:hidden absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/10 bg-gray-900/95 backdrop-blur-md shadow-2xl shadow-black/40 p-2"
        >
          {user ? (
            <>
              <div className="flex items-center gap-3 px-3 py-3 min-w-0">
                <Avatar name={user.fullName} />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{user.fullName}</p>
                  <p className="text-sm text-white/60 truncate">{user.email}</p>
                </div>
              </div>
              <div className="my-1 h-px bg-white/10" />
              <nav aria-label="Main" className="flex flex-col gap-1">
                {renderLinks("flex items-center gap-3 rounded-lg px-3 py-3 min-h-11 font-medium transition-colors")}
              </nav>
              <div className="my-1 h-px bg-white/10" />
              <LogoutRow onLogout={handleLogout} state={logoutState} className="py-3 min-h-11 font-medium" />
            </>
          ) : (
            <div className="flex flex-col gap-2 p-2">
              <Link to="/login" className={`${primaryButtonClass} px-5 py-3`}>
                Log in
              </Link>
              <Link to="/register" className={`${secondaryButtonClass} px-5 py-3`}>
                Sign up
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

export default Header;
