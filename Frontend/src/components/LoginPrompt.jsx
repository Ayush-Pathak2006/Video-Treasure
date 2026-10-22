import React from "react";
import { Link } from "react-router-dom";

const primaryButtonClass =
  "inline-flex items-center justify-center px-5 py-2 rounded-full font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 transition-colors";
const secondaryButtonClass =
  "inline-flex items-center justify-center px-5 py-2 rounded-full font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-colors";

// What anonymous visitors see in place of an action that needs an account: a message, then Log in and Sign up.
function LoginPrompt({ message, className = "" }) {
  return (
    <div className={`space-y-4 ${className}`}>
      <p className="text-white/80">{message}</p>
      <div className="flex flex-wrap gap-3">
        <Link to="/login" className={primaryButtonClass}>
          Log in
        </Link>
        <Link to="/register" className={secondaryButtonClass}>
          Sign up
        </Link>
      </div>
    </div>
  );
}

export default LoginPrompt;
