import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AppContext'; 

function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await axios.post('http://localhost:8000/api/v1/users/register', data);
      console.log('Registration successful:', response.data);

      await login(data.email, data.password);
      
      navigate('/'); // Redirect to login page on successful registration
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
      console.error('Registration error:', err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6 bg-white/10 rounded-xl shadow-lg border border-white/20 backdrop-blur-sm">
        <h1 className="text-3xl font-bold text-center text-white">Create an Account</h1>
        {error && <p className="text-red-400 text-center">{error}</p>}
        <form onSubmit={handleRegister} className="space-y-6">
          {/* Form fields for fullName, username, email, password */}
          {/* Example for fullName */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-300">Full Name</label>
            <input id="fullName" name="fullName" type="text" required className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
           <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300">Username</label>
            <input id="username" name="username" type="text" required className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
           <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email</label>
            <input id="email" name="email" type="email" required className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">Password</label>
            <input id="password" name="password" type="password" required className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <button type="submit" className="w-full py-2 px-4 font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors">
              Register
            </button>
          </div>
        </form>
        <p className="text-sm text-center text-gray-400">
          Already have an account? <Link to="/login" className="font-medium text-purple-400 hover:underline">Login here</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;