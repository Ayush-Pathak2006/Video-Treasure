import React from 'react';
import { useAuth } from '../context/AppContext';
import { Navigate, Outlet } from 'react-router-dom';

function ProtectedRoute() {
    const { user } = useAuth();
    return user ? <Outlet /> : <Navigate to="/login" />;
}

export default ProtectedRoute;