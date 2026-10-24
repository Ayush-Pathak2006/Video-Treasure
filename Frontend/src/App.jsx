import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Player from "./pages/Player";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProtectedRoute from "./components/ProtectedRoute";
import Header from "./components/Header";
import Footer from "./components/Footer";
import LikedVideos from "./pages/LikedVideos";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Playlists from "./pages/Playlists";
import PlaylistDetail from "./pages/PlaylistDetail";
import History from "./pages/History";



function App() {
  return (
    <>
      {/* On every page, like the footer. Sticky, so pages start below it without an offset of their own. */}
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watch/:platform/:id" element={<Player />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route element={<ProtectedRoute />}>
        <Route path="/liked-videos" element={<LikedVideos />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/playlists/:playlistId" element={<PlaylistDetail />} />
        <Route path="/history" element={<History />} />
        </Route>
      </Routes>
      <Footer />
    </>
  );
}

export default App;
