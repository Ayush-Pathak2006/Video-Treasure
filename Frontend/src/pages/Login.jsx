import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AppContext";
import ppi from "../api/axios";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setShowResend(false);
    setResendMessage("");

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      await login(data.email, data.password);
      navigate("/");
    } catch (err) {
      const message =
        err.response?.data?.message ||
        "Login failed. Please check your credentials.";

      // 🔑 If email not verified → show resend option
      if (message.toLowerCase().includes("verify")) {
        setInfo(message);
        setShowResend(true);
      } else {
        setError(message);
      }
    }
  };

  // 🔁 Resend verification email
  const handleResendVerification = async () => {
    setResendLoading(true);
    setResendMessage("");

    try {
      const emailInput = document.querySelector('input[name="email"]').value;

      await ppi.post("/api/v1/users/resend-verification-email", {
        email: emailInput,
      });

      setResendMessage(
        "If the email exists and is unverified, a verification email has been sent."
      );
    } catch (err) {
      setResendMessage(
        "Something went wrong while resending verification email."
      );
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6 bg-white/10 rounded-xl shadow-lg border border-white/20 backdrop-blur-sm">
        <h1 className="text-3xl font-bold text-center text-white">Login</h1>

        {info && <p className="text-yellow-400 text-center">{info}</p>}
        {error && <p className="text-red-400 text-center">{error}</p>}
        {resendMessage && (
          <p className="text-green-400 text-center">{resendMessage}</p>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Email or Username
            </label>
            <input
              name="email"
              type="text"
              required
              className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md"
            />
          </div>

          <p className="text-sm text-center text-gray-400 mt-2">
            <Link
              to="/forgot-password"
              className="text-purple-400 hover:underline"
            >
              Forgot your password?
            </Link>
          </p>

          <button
            type="submit"
            className="w-full py-2 px-4 font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors"
          >
            Login
          </button>
        </form>

        {/* 🔁 Resend verification button */}
        {showResend && (
          <button
            onClick={handleResendVerification}
            disabled={resendLoading}
            className="w-full mt-2 py-2 px-4 text-sm font-medium text-purple-300 border border-purple-400 rounded-md hover:bg-purple-600 hover:text-white transition-colors"
          >
            {resendLoading ? "Sending..." : "Resend verification email"}
          </button>
        )}

        <p className="text-sm text-center text-gray-400">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-purple-400 hover:underline"
          >
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
