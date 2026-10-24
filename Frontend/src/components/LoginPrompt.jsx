import React from "react";
import { Link } from "react-router-dom";
import { rememberReturnTo } from "../utils/afterLogin";
import { primaryButtonClass, secondaryButtonClass } from "./buttonStyles";

/**
 * What anonymous visitors see in place of an action that needs an account: a message, then Log in and Sign up.
 * `returnTo` (a path) brings the visitor back to that page after logging in. `compact` fits it on one small line.
 */
function LoginPrompt({ message, className = "", returnTo = null, compact = false }) {
  const handleClick = returnTo ? () => rememberReturnTo(returnTo) : undefined;
  const size = compact ? "px-3 py-1 text-xs" : "px-5 py-2";

  return (
    <div className={`${compact ? "flex flex-wrap items-center gap-2 text-sm" : "space-y-4"} ${className}`}>
      <p className="text-white/80">{message}</p>
      <div className={`flex flex-wrap ${compact ? "gap-2" : "gap-3"}`}>
        <Link to="/login" onClick={handleClick} className={`${primaryButtonClass} ${size}`}>
          Log in
        </Link>
        <Link to="/register" onClick={handleClick} className={`${secondaryButtonClass} ${size}`}>
          Sign up
        </Link>
      </div>
    </div>
  );
}

export default LoginPrompt;
