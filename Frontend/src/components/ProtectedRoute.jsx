import React from "react";
import { useAuth } from "../context/AppContext";
import { Navigate, Outlet } from "react-router-dom";

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/80">
        Checking your session...
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

export default ProtectedRoute;