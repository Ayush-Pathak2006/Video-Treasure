import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import ppi from "../api/axios";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Verification token is missing.");
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await ppi.get(
          `/api/v1/users/verify-email?token=${token}`
        );

        setStatus("success");
        setMessage(response.data.message || "Email verified successfully.");

        // Redirect to login after success
        setTimeout(() => {
          navigate("/login");
        }, 2500);

      } catch (error) {
        setStatus("error");
        setMessage(
          error.response?.data?.message ||
            "Verification failed or link expired."
        );
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center text-white">
      <div className="p-6 rounded-lg bg-white/10 border border-white/20">
        {status === "verifying" && <p>Verifying your email…</p>}
        {status === "success" && (
          <p className="text-green-400">{message}</p>
        )}
        {status === "error" && (
          <p className="text-red-400">{message}</p>
        )}
      </div>
    </div>
  );
}

export default VerifyEmail;
