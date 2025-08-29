import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AppContext'; 

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth(); 
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      await login(data.email, data.password);
      navigate('/'); 
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6 bg-white/10 rounded-xl shadow-lg border border-white/20 backdrop-blur-sm">
        <h1 className="text-3xl font-bold text-center text-white">Login</h1>
        {error && <p className="text-red-400 text-center">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-6">
          {/* Email input */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email or Username</label>
            <input id="email" name="email" type="text" required className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          {/* Password input */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">Password</label>
            <input id="password" name="password" type="password" required className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          {/* Submit button */}
          <div>
            <button type="submit" className="w-full py-2 px-4 font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors">
              Login
            </button>
          </div>
        </form>
        <p className="text-sm text-center text-gray-400">
          Don't have an account? <Link to="/register" className="font-medium text-purple-400 hover:underline">Register here</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;