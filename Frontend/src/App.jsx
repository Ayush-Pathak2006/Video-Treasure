import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Player from "./pages/Player";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProtectedRoute from "./components/ProtectedRoute";
import LikedVideos from "./pages/LikedVideos";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";



function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/watch/:id" element={<Player />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />  
      <Route element={<ProtectedRoute />}>
      <Route path="/liked-videos" element={<LikedVideos />} />
      </Route>
    </Routes>
  );
}

export default App;
