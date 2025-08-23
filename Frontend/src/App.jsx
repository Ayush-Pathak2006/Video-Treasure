import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Player from './pages/Player';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/watch/:id" element={<Player />} />
    </Routes>
  );
}

export default App;