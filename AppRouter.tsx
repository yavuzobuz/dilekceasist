import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { LandingPage } from './components/LandingPage';
import { AppMain } from './src/components/AppMain';
import Login from './src/pages/Login';
import Register from './src/pages/Register';
import Profile from './src/pages/Profile';
import PetitionPool from './src/pages/PetitionPool';
import About from './src/pages/About';
import FAQ from './src/pages/FAQ';
import ProtectedRoute from './src/components/auth/ProtectedRoute';

export default function App() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    localStorage.setItem('hasVisited', 'true');
    navigate('/app');
  };

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
      <Route path="/petition-pool" element={<PetitionPool />} />
      <Route path="/pool" element={<PetitionPool />} /> {/* Legacy route */}
      <Route path="/about" element={<About />} />
      <Route path="/faq" element={<FAQ />} />
    </Routes>
  );
}
