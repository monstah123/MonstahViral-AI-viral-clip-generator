import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-black border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-12 sm:h-12 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-black text-lg sm:text-2xl font-black">M</span>
            </div>
            <h1 className="text-lg sm:text-2xl font-black">
              <span className="text-white">MONSTAH</span>
              <span className="text-green-500">VIRAL</span>
            </h1>
          </div>

          {/* Navigation — hide links on mobile, keep Pro button */}
          <nav className="flex items-center gap-4 sm:gap-8">
            <a href="#tutorials" className="text-gray-300 hover:text-white transition-colors font-medium text-sm hidden md:block">
              TUTORIALS
            </a>
            <a href="#showcase" className="text-gray-300 hover:text-white transition-colors font-medium text-sm hidden md:block">
              SHOWCASE
            </a>
            <button className="px-4 py-1.5 sm:px-6 sm:py-2 bg-gradient-to-r from-zinc-800 to-zinc-900 border border-zinc-700 text-gray-300 rounded-full font-bold hover:text-white hover:border-zinc-500 transition-all text-[10px] sm:text-xs tracking-widest whitespace-nowrap uppercase">
              COMING SOON
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;