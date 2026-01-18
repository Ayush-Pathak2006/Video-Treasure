import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ppi from '../api/axios';

function Register() {
  const navigate = useNavigate();

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await ppi.post('/api/v1/users/register', data);

      setSuccess(
        'Registration successful! Please check your email and verify your account before logging in.'
      );

      // Redirect to login after short delay
      // setTimeout(() => {
      //   navigate('/login');
      // }, 2500);

    } catch (err) {
      setError(
        err.response?.data?.message || 'Registration failed. Please try again.'
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6 bg-white/10 rounded-xl shadow-lg border border-white/20 backdrop-blur-sm">
        <h1 className="text-3xl font-bold text-center text-white">
          Create an Account
        </h1>

        {error && <p className="text-red-400 text-center">{error}</p>}
        {success && <p className="text-green-400 text-center">{success}</p>}

        <form onSubmit={handleRegister} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Full Name
            </label>
            <input
              name="fullName"
              type="text"
              required
              className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300">
              Username
            </label>
            <input
              name="username"
              type="text"
              required
              className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              className="w-full px-3 py-2 mt-1 text-white bg-white/5 border border-white/20 rounded-md"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 px-4 font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700"
          >
            Register
          </button>
        </form>

        <p className="text-sm text-center text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-purple-400 hover:underline">
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;



