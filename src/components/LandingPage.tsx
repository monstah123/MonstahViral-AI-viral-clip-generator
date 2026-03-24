import React, { useEffect, useRef, useState } from 'react';

interface LandingPageProps {
  onStart: () => void;
}

const features = [
  {
    icon: '🤖',
    title: 'AI Shot Detection',
    description: 'Powered by Google Gemini, automatically detects your most viral-worthy moments with pinpoint accuracy.',
    color: 'from-purple-500/20 to-purple-900/10',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
  },
  {
    icon: '🎬',
    title: 'One-Click Clip Export',
    description: 'Instantly cut and export MP4 clips directly in your browser using FFmpeg. No uploads, no waiting.',
    color: 'from-blue-500/20 to-blue-900/10',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
  },
  {
    icon: '☁️',
    title: 'AWS-Powered Storage',
    description: 'Your videos are securely stored on AWS S3. Lightning-fast uploads and no storage limits.',
    color: 'from-orange-500/20 to-orange-900/10',
    border: 'border-orange-500/30',
    glow: 'shadow-orange-500/20',
  },
  {
    icon: '🔥',
    title: 'Viral Score Engine',
    description: 'Every shot gets a viral potential score from 0-100, so you always know which clip to post first.',
    color: 'from-red-500/20 to-red-900/10',
    border: 'border-red-500/30',
    glow: 'shadow-red-500/20',
  },
  {
    icon: '#️⃣',
    title: 'Auto Hashtag Generator',
    description: 'Get trending, AI-curated hashtags generated for every shot to maximize your reach on social media.',
    color: 'from-green-500/20 to-green-900/10',
    border: 'border-green-500/30',
    glow: 'shadow-green-500/20',
  },
  {
    icon: '⚡',
    title: 'Browser-Native Speed',
    description: 'Everything runs locally in your browser. No servers, no waiting, no nonsense. Pure speed.',
    color: 'from-yellow-500/20 to-yellow-900/10',
    border: 'border-yellow-500/30',
    glow: 'shadow-yellow-500/20',
  },
];

const steps = [
  { number: '01', label: 'Upload', desc: 'Drop your raw video footage' },
  { number: '02', label: 'Analyze', desc: 'AI scans every second for viral potential' },
  { number: '03', label: 'Clip', desc: 'One-click export your best shots as MP4' },
  { number: '04', label: 'Post', desc: 'From drop to TikTok in under 5 minutes' },
];

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
        <div className="relative z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm text-sm text-gray-400 mb-8 font-mono">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block"></span>
          Powered by Google Gemini AI · AWS S3
        </div>

        {/* Main Headline */}
        <div className="relative z-10 text-center max-w-5xl">
          <h1 className="text-7xl md:text-9xl font-black tracking-tighter leading-none mb-6">
            <span className="block text-white">FEED THE</span>
            <span className="block bg-gradient-to-r from-purple-500 via-blue-400 to-orange-500 bg-clip-text text-transparent animate-gradient-x">
              MONSTAH
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            Drop your raw footage. Let <span className="text-orange-400 font-bold">AI</span> hunt down your most viral moments and export them as ready-to-post clips. <span className="text-white font-semibold">In minutes.</span>
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onStart}
              className="group relative px-10 py-5 text-xl font-black rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95 shadow-2xl hover:shadow-purple-500/30"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-blue-500 to-orange-500"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-blue-400 to-orange-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="relative z-10 flex items-center gap-3">
                🎬 START FOR FREE
                <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
              </span>
            </button>
            <button
              onClick={onStart}
              className="px-10 py-5 text-xl font-bold rounded-2xl border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-300"
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
      <section className="py-32 px-4 max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <p className="text-purple-400 font-mono text-sm tracking-widest mb-3">THE PROCESS</p>
          <h2 className="text-5xl font-black">From Upload to Viral in <span className="text-orange-500">4 Steps</span></h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 relative">
          {/* Connector Line */}
          <div className="hidden md:block absolute top-[2.75rem] left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-purple-500 via-blue-500 to-orange-500 opacity-40"></div>

          {steps.map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center p-6 group relative z-10">
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
      <section className="py-32 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/80 to-transparent pointer-events-none"></div>
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-20">
            <p className="text-blue-400 font-mono text-sm tracking-widest mb-3">FEATURES</p>
            <h2 className="text-5xl font-black">Built to <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Go Viral</span></h2>
            <p className="text-gray-500 mt-4 text-lg max-w-xl mx-auto">Every feature is engineered to take your content from raw footage to viral clip as fast as humanly possible.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feat, i) => (
              <div
                key={i}
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
      <section className="py-40 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-purple-950/20 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-6xl mb-6">👹</p>
          <h2 className="text-6xl md:text-7xl font-black mb-6 leading-tight">
            The Monstah is <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">Hungry.</span>
          </h2>
          <p className="text-xl text-gray-400 mb-12">Drop your video. Let it feed. Watch your clips go viral.</p>
          <button
            onClick={onStart}
            className="group relative px-14 py-6 text-2xl font-black rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95 shadow-2xl hover:shadow-orange-500/30 mx-auto"
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
        MONSTAHVIRAL · AI-POWERED VIRAL CLIP GENERATOR · BUILT ON AWS + GEMINI
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
