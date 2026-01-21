import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-black border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center">
              <span className="text-black text-2xl font-black font-brand">M</span>
            </div>
            <h1 className="text-2xl font-black font-brand">
              <span className="text-white">MONSTAH</span>
              <span className="text-green-500">VIRAL</span>
            </h1>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-8">
            <a href="#tutorials" className="text-gray-300 hover:text-white transition-colors font-medium">
              TUTORIALS
            </a>
            <a href="#showcase" className="text-gray-300 hover:text-white transition-colors font-medium">
              SHOWCASE
            </a>
            <button className="px-6 py-2 bg-white text-black rounded-full font-bold hover:bg-gray-100 transition-colors">
              Pro Plan
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;