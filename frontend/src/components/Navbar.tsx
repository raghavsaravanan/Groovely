import { Link, useLocation } from 'react-router-dom';
import { Home as HomeIcon, Compass, Trophy, User, LogIn, PlusSquare, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Navbar() {
  const location = useLocation();
  const { user, profile } = useAuth();
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-blue-600">Groovely</span>
          </Link>

          <div className="flex items-center space-x-6">
            <Link to="/" className={`flex items-center space-x-1 ${isActive('/') ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
              <HomeIcon size={20} /><span className="font-medium">Home</span>
            </Link>
            <Link to="/explore" className={`flex items-center space-x-1 ${isActive('/explore') ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
              <Compass size={20} /><span className="font-medium">Explore</span>
            </Link>
            <Link to="/leaderboard" className={`flex items-center space-x-1 ${isActive('/leaderboard') ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
              <Trophy size={20} /><span className="font-medium">Leaderboard</span>
            </Link>
            <Link to="/crews" className={`flex items-center space-x-1 ${isActive('/crews') ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
              <Users size={20} /><span className="font-medium">Crews</span>
            </Link>
            <Link to="/create" className={`flex items-center space-x-1 ${isActive('/create') ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
              <PlusSquare size={20} /><span className="font-medium">Create</span>
            </Link>
            {user && profile ? (
              <Link to="/profile" className={`flex items-center space-x-1 ${isActive('/profile') ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                <User size={20} /><span className="font-medium">Profile</span>
              </Link>
            ) : (
              <Link to="/login" className={`flex items-center space-x-1 ${isActive('/login') ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                <LogIn size={20} /><span className="font-medium">Login</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}