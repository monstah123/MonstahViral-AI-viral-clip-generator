import React, { useEffect, useRef, useState } from 'react';

interface LandingPageProps {
  onStart: () => void;
}

const features = [
  {
    icon: '🧠',
    title: 'Viral Architect 3.0',
    description: 'Advanced Neurological Trigger analysis based on 2026 retention models. It doesn\'t just "find" shots—it predicts psychological impact.',
    color: 'from-purple-500/20 to-purple-900/10',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
  },
  {
    icon: '🌫️',
    title: 'Smart Pro-Formats',
    description: 'Go beyond black bars. Use "Monstah Blur" for a premium look or "Intelligent Zoom" to focus on active speakers automatically.',
    color: 'from-blue-500/20 to-blue-900/10',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
  },
  {
    icon: '🏯',
    title: 'Infinite Project Vault',
    description: 'Never lose a banger. Projects are auto-saved to your AWS vault with automated visual thumbnails for instant reloading.',
    color: 'from-orange-500/20 to-orange-900/10',
    border: 'border-orange-500/30',
    glow: 'shadow-orange-500/20',
  },
  {
    icon: '🔥',
    title: 'Dopamine Spike Engine',
    description: 'Identifies the exact frames where audio/visual energy peaks align for maximum viewer dopamine release.',
    color: 'from-red-500/20 to-red-900/10',
    border: 'border-red-500/30',
    glow: 'shadow-red-500/20',
  },
  {
    icon: '#️⃣',
    title: 'Meta-Hashtag Hub',
    description: 'AI-curated "Deep-Meta" hashtags generated for every shot to ensure you land on every FYP in 2026.',
    color: 'from-green-500/20 to-green-900/10',
    border: 'border-green-500/30',
    glow: 'shadow-green-500/20',
  },
  {
    icon: '⚡',
    title: 'Elite Universal Compatibility',
    description: 'MP4 clips are re-encoded with libx264 for perfect playback on iPhone, Android, Windows, and Mac. Guaranteed.',
    color: 'from-yellow-500/20 to-yellow-900/10',
    border: 'border-yellow-500/30',
    glow: 'shadow-yellow-500/20',
  },
];

const steps = [
  { number: '01', label: 'Upload', desc: 'Drop your raw video footage' },
  { number: '02', label: 'Analyze', desc: 'AI scans every second for viral potential' },
  { number: '03', label: 'Clip', desc: 'One-click export your best shots as MP4' },
  { number: '04', label: 'Post', desc: 'From raw drop to every feed in record time' },
];

// Synthesize a subtle, premium "glass tap" hover sound for tiles
const playTileHoverSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    // Quick frequency drop for a "tap" sound
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);

    osc.onended = () => ctx.close();
  } catch (_) {
    // Silently fail if audio is blocked
  }
};

const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  // Particle animation on canvas
  useEffect(() => {
    setVisible(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const particles: { x: number; y: number; vx: number; vy: number; r: number; alpha: number; color: string }[] = [];
    const colors = ['#a855f7', '#3b82f6', '#f97316', '#22c55e'];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // Draw connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = particles[i].color;
            ctx.globalAlpha = (1 - dist / 100) * 0.15;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className={`min-h-screen bg-black text-white overflow-x-hidden transition-opacity duration-700 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
        {/* Particle Canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Big gradient blobs */}
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-orange-600/10 rounded-full blur-[150px] pointer-events-none" />

        {/* Badge */}
        <div className="relative z-10 flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm text-xs sm:text-sm text-gray-400 mb-8 font-mono text-center">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block flex-shrink-0"></span>
          Powered by Google Gemini 3 Flash · AWS S3
        </div>

        {/* Main Headline */}
        <div className="relative z-10 text-center max-w-5xl px-4">
          <h1 className="text-5xl sm:text-7xl md:text-9xl font-black tracking-tighter leading-none mb-6">
            <span className="block text-white">FEED THE</span>
            <span className="block bg-gradient-to-r from-purple-500 via-blue-400 to-orange-500 bg-clip-text text-transparent animate-gradient-x">
              MONSTAH
            </span>
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed">
            Drop your raw footage. Let <span className="text-orange-400 font-bold">AI</span> hunt down your most viral moments and export them as ready-to-post clips. <span className="text-white font-semibold">In minutes.</span>
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
            <button
              onClick={onStart}
              className="group relative w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 text-lg sm:text-xl font-black rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95 shadow-2xl hover:shadow-purple-500/30"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-blue-500 to-orange-500"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-blue-400 to-orange-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="relative z-10 flex items-center justify-center gap-3">
                🎬 START FOR FREE
                <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
              </span>
            </button>
            <button
              onClick={onStart}
              className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 text-lg sm:text-xl font-bold rounded-2xl border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-300"
            >
              Watch Demo
            </button>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-600 animate-bounce z-10">
          <span className="text-xs font-mono tracking-widest">SCROLL</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-20 sm:py-32 px-4 max-w-6xl mx-auto">
        <div className="text-center mb-12 sm:mb-20">
          <p className="text-purple-400 font-mono text-sm tracking-widest mb-3">THE PROCESS</p>
          <h2 className="text-3xl sm:text-5xl font-black">From Upload to Viral in <span className="text-orange-500">4 Steps</span></h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 relative">
          {/* Connector Line */}
          <div className="hidden md:block absolute top-[2.75rem] left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-purple-500 via-blue-500 to-orange-500 opacity-40"></div>

          {steps.map((step, i) => (
            <div key={i} onMouseEnter={playTileHoverSound} className="flex flex-col items-center text-center p-6 group relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-700 group-hover:border-blue-500/50 flex items-center justify-center mb-4 font-black text-2xl text-gray-500 group-hover:text-white transition-all duration-300 shadow-xl group-hover:shadow-blue-500/20 group-hover:scale-110">
                {step.number}
              </div>
              <h3 className="text-xl font-black mb-2 group-hover:text-blue-400 transition-colors">{step.label}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="py-20 sm:py-32 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/80 to-transparent pointer-events-none"></div>
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-12 sm:mb-20">
            <p className="text-blue-400 font-mono text-sm tracking-widest mb-3">FEATURES</p>
            <h2 className="text-3xl sm:text-5xl font-black">Built to <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Go Viral</span></h2>
            <p className="text-gray-500 mt-4 text-base sm:text-lg max-w-xl mx-auto">Every feature is engineered to take your content from raw footage to viral clip as fast as humanly possible.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((feat, i) => (
              <div
                key={i}
                onMouseEnter={playTileHoverSound}
                className={`group relative p-8 rounded-3xl border ${feat.border} bg-gradient-to-br ${feat.color} backdrop-blur-sm hover:shadow-2xl ${feat.glow} transition-all duration-500 hover:-translate-y-2 hover:scale-[1.02] cursor-default`}
              >
                <div className="text-5xl mb-5">{feat.icon}</div>
                <h3 className="text-xl font-black mb-3 group-hover:text-white transition-colors">{feat.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed group-hover:text-gray-300 transition-colors">{feat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="py-24 sm:py-40 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-green-950/10 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          
          {/* Cyberpunk GIF Animation */}
          <div className="mb-12 relative group w-full max-w-2xl">
            {/* Glowing backdrop */}
            <div className="absolute inset-0 bg-green-500 blur-[80px] opacity-20 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none"></div>
            {/* The GIF */}
            <img 
              src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3NqZTM1bjlzOXFhbmZlMXZ2Mm5maGE1ZmN4M2oyZ25la3BsampyOSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/sOzHwf1DF8h96A5tXU/giphy.gif" 
              alt="Monstah eating data" 
              className="w-full h-auto rounded-3xl border border-green-500/20 shadow-[0_0_50px_rgba(34,197,94,0.15)] relative z-10 mix-blend-screen object-cover"
            />
          </div>

          <h2 className="text-4xl sm:text-6xl md:text-7xl font-black mb-6 leading-tight">
            The Monstah is <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">Hungry.</span>
          </h2>
          
          <div className="mb-10 sm:mb-12 font-mono bg-zinc-950/50 p-6 sm:p-8 rounded-2xl border border-green-500/20 backdrop-blur-md inline-block text-left shadow-2xl">
             <p className="text-green-400 text-sm md:text-base mb-2 animate-pulse">&gt; SYSTEM.AWAITING_RAW_FOOTAGE...</p>
             <p className="text-gray-300 text-lg sm:text-xl">&gt; Drop your video.<br/>&gt; Let it feed.<br/>&gt; Watch your clips go viral.</p>
          </div>

          <button
            onClick={onStart}
            className="group relative w-full sm:w-auto px-10 sm:px-14 py-5 sm:py-6 text-xl sm:text-2xl font-black rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(249,115,22,0.3)] hover:shadow-[0_0_60px_rgba(249,115,22,0.5)]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-orange-400 via-red-400 to-pink-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="relative z-10 flex items-center gap-3 justify-center">
              🔥 FEED THE MONSTAH NOW
            </span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 px-4 text-center text-gray-600 text-sm font-mono">
        MONSTAHVIRAL · AI-POWERED VIRAL CLIP GENERATOR · BUILT ON AWS + GEMINI 3
      </footer>

      <style>{`
        @keyframes gradient-x {
          0%, 100% { background-size: 200% 200%; background-position: left center; }
          50% { background-size: 200% 200%; background-position: right center; }
        }
        .animate-gradient-x {
          animation: gradient-x 4s ease infinite;
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
