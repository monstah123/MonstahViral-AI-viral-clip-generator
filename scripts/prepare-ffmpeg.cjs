/**
 * prepare-ffmpeg.cjs
 * Runs during Vercel build to copy the ffmpeg binary from ffmpeg-static
 * into the api/ directory so it's co-located with the serverless function.
 */
const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, '..', 'api', 'ffmpeg-bin');

// Try ffmpeg-static
try {
  const src = require('ffmpeg-static');
  if (src && fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    const size = fs.statSync(dest).size;
    console.log(`✅ FFmpeg binary copied: ${src} → ${dest} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    process.exit(0);
  } else {
    console.log('⚠️ ffmpeg-static returned path but file missing:', src);
  }
} catch (e) {
  console.log('⚠️ ffmpeg-static require failed:', e.message);
}

// Force reinstall ffmpeg-static and retry
try {
  console.log('Attempting npm rebuild ffmpeg-static...');
  require('child_process').execSync('npm rebuild ffmpeg-static', { stdio: 'inherit' });
  const src = require('ffmpeg-static');
  if (src && fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    const size = fs.statSync(dest).size;
    console.log(`✅ FFmpeg binary copied after rebuild: ${src} → ${dest} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    process.exit(0);
  }
} catch (e) {
  console.log('⚠️ Rebuild failed:', e.message);
}

console.error('❌ Could not obtain FFmpeg binary from any source');
process.exit(1);
