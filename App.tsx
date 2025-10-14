import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { LandingPage } from './components/LandingPage';
import { AppMain } from './src/components/AppMain';
import Login from './src/pages/Login';
import Register from './src/pages/Register';
import Profile from './src/pages/Profile';
import ProtectedRoute from './src/components/auth/ProtectedRoute';

export default function App() {
  const [showLanding, setShowLanding] = useState(() => {
    const hasVisited = localStorage.getItem('hasVisited');
    return !hasVisited;
  });

  const handleGetStarted = () => {
    localStorage.setItem('hasVisited', 'true');
    setShowLanding(false);
  };

  if (showLanding) {
    return <LandingPage onGetStarted={handleGetStarted} />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage onGetStarted={handleGetStarted} />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/app"
        element={
          <AppMain />
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
