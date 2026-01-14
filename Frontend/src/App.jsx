import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Player from "./pages/Player";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProtectedRoute from "./components/ProtectedRoute";
import LikedVideos from "./pages/LikedVideos";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/watch/:id" element={<Player />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
      <Route path="/liked-videos" element={<LikedVideos />} />
      </Route>
    </Routes>
  );
}

export default App;
