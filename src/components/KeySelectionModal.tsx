
import React from 'react';

interface Props {
  onKeySelected: () => void;
}

const KeySelectionModal: React.FC<Props> = ({ onKeySelected }) => {
  const handleOpenKey = async () => {
    // @ts-ignore
    await window.aistudio.openSelectKey();
    // Assuming success as per instructions
    onKeySelected();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 transform -rotate-6">
           <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className="text-2xl font-brand text-white mb-4 uppercase tracking-tighter">Monstah Key Required</h2>
        <p className="text-zinc-400 mb-8 leading-relaxed">
          To generate high-quality viral shorts with Veo 3.1, you need to select a paid API key from your Google Cloud Project.
        </p>
        
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-8 text-left">
          <p className="text-xs text-blue-400 font-bold mb-2">IMPORTANT:</p>
          <ul className="text-[11px] text-zinc-500 space-y-2 list-disc pl-4">
            <li>Ensure billing is enabled (ai.google.dev/gemini-api/docs/billing)</li>
            <li>Use a project with Vertex AI or Gemini API access</li>
            <li>Video generation takes roughly 30-60 seconds</li>
          </ul>
        </div>

        <button 
          onClick={handleOpenKey}
          className="w-full py-4 bg-white text-black rounded-xl font-bold uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all transform active:scale-95"
        >
          SELECT API KEY
        </button>
        
        <p className="mt-6 text-zinc-600 text-[10px]">
          By proceeding, you agree to our Terms of AI Generation.
        </p>
      </div>
    </div>
  );
};

export default KeySelectionModal;
