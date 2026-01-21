import React, { useState, useRef } from 'react';

interface VideoUploaderProps {
  onUpload: (file: File) => void;
  isLoading: boolean;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ onUpload, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="border-2 border-dashed border-white rounded-lg p-20 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white"></div>
            <p className="text-xl">Processing your video...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed border-white rounded-lg p-16 text-center
          transition-all duration-300 cursor-pointer
          ${isDragging ? 'bg-white/5 border-blue-400' : 'hover:bg-white/5'}
        `}
        onClick={() => !isDragging && handleBrowseClick()}
      >
        <div className="flex flex-col items-center gap-6">
          {/* Plus Icon */}
          <div className="text-white">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          
          {/* Text */}
          <div>
            <h3 className="text-2xl font-bold mb-2">Drop your video here</h3>
            <p className="text-gray-400">Let the Monstah find your next hit</p>
          </div>

          {/* Browse Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleBrowseClick();
            }}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold uppercase tracking-wider transition-colors"
          >
            Browse Files
          </button>
          
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="video/*,.mp4,.mov,.avi,.mkv"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
};

export default VideoUploader;