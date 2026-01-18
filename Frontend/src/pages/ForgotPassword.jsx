import React, { useState } from "react";
import { Link } from "react-router-dom";
import ppi from "../api/axios";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await ppi.post("/api/v1/users/forgot-password", { email });
      setMessage(
        "If the email exists, a password reset link has been sent."
      );
    } catch (err) {
      setMessage(
        "If the email exists, a password reset link has been sent."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 bg-white/10 rounded-xl border border-white/20">
        <h1 className="text-2xl font-bold text-white text-center">
          Forgot Password
        </h1>

        {message && (
          <p className="text-green-400 text-center mt-4">{message}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <input
            type="email"
            placeholder="Enter your email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-white bg-white/5 border border-white/20 rounded-md"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="text-sm text-center text-gray-400 mt-4">
          <Link to="/login" className="text-purple-400 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
