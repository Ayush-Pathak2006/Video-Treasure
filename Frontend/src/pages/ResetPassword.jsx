import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import ppi from "../api/axios";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      await ppi.post(`/api/v1/users/reset-password?token=${token}`, {
        password
      });

      setMessage("Password reset successful. Redirecting to login...");
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Reset link is invalid or expired."
      );
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <p className="text-center text-red-400 mt-10">
        Invalid reset link.
      </p>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 bg-white/10 rounded-xl border border-white/20">
        <h1 className="text-2xl font-bold text-white text-center">
          Reset Password
        </h1>

        {message && (
          <p className="text-green-400 text-center mt-4">{message}</p>
        )}
        {error && (
          <p className="text-red-400 text-center mt-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <input
            type="password"
            placeholder="New password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-white bg-white/5 border border-white/20 rounded-md"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            {loading ? "Resetting..." : "Reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ResetPassword;
