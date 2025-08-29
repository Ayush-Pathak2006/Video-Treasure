import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AppContext';

function Header() {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false); // State for mobile menu

    return (
        <header className="absolute top-0 left-0 right-0 p-4 bg-gray-900/30 backdrop-blur-sm z-10">
            <div className="container mx-auto flex justify-between items-center">
                <Link to="/" className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 text-transparent bg-clip-text">
                    Video Treasure
                </Link>

                {/* Desktop Menu */}
                <nav className="hidden md:flex items-center gap-4">
                    {user ? (
                        <>
                            <Link to="/liked-videos" className="text-white hover:text-purple-400 transition-colors">
                                Liked Videos
                            </Link>
                            <span className="text-white">Welcome, {user.fullName}!</span>
                            <button onClick={logout} className="bg-red-600/80 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors">
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <Link to="/login" className="bg-white/10 text-white py-2 px-4 rounded-md hover:bg-white/20 transition-colors">
                                Login
                            </Link>
                            <Link to="/register" className="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors">
                                Register
                            </Link>
                        </>
                    )}
                </nav>

                {/* Mobile Menu Button */}
                <div className="md:hidden">
                    <button onClick={() => setIsOpen(!isOpen)} className="text-white focus:outline-none">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16m-7 6h7"} />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {isOpen && (
                <nav className="md:hidden mt-4">
                    {user ? (
                        <div className="flex flex-col items-center gap-4">
                            <Link to="/liked-videos" className="text-white block w-full text-center py-2" onClick={() => setIsOpen(false)}>Liked Videos</Link>
                            <button onClick={logout} className="bg-red-600/80 text-white py-2 px-4 rounded-md w-full">Logout</button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <Link to="/login" className="bg-white/10 text-white py-2 px-4 rounded-md w-full text-center" onClick={() => setIsOpen(false)}>Login</Link>
                            <Link to="/register" className="bg-purple-600 text-white py-2 px-4 rounded-md w-full text-center" onClick={() => setIsOpen(false)}>Register</Link>
                        </div>
                    )}
                </nav>
            )}
        </header>
    );
}

export default Header;