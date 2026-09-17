const fetch = require('node-fetch') || globalThis.fetch;

async function checkLive(videoId) {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    console.log(`Video ${videoId} matches:`, html.match(/isLiveBroadcast[^\,}]*/g));
}

checkLive('jfKfPfyJRdk');
