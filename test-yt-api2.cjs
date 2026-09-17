const fs = require('fs');
const fetch = require('node-fetch') || globalThis.fetch;

async function check() {
  // Parse netscape cookies.txt to Cookie header
  const cookieStr = fs.readFileSync('./lavalink/yt-dlp/cookies.txt', 'utf8');
  const cookies = cookieStr.split('\n')
    .filter(l => !l.startsWith('#') && l.trim().length > 0)
    .map(l => {
      const parts = l.split('\t');
      return `${parts[5]}=${parts[6]}`;
    }).join('; ');

  const res = await fetch('https://www.youtube.com/@JudeShimizu/streams', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Cookie': cookies
    }
  });
  const html = await res.text();
  const match = html.match(/var ytInitialData = (.*);<\/script>/);
  if (!match) return console.log('No ytInitialData');
  
  const data = JSON.parse(match[1]);
  const strData = JSON.stringify(data);
  
  const videoMatches = [...strData.matchAll(/"videoId":"([^"]+)"/g)];
  const uniqueVideos = [...new Set(videoMatches.map(m => m[1]))];
  console.log('Found video IDs:', uniqueVideos.slice(0, 5));
  
  if (strData.includes('BADGE_STYLE_TYPE_LIVE_NOW')) {
      const liveVideoBlock = strData.match(/{"videoId":"([^"]+)","thumbnail":.*?BADGE_STYLE_TYPE_LIVE_NOW.*?title":{"runs":\[{"text":"(.*?)"}\]/);
      if (liveVideoBlock) {
          console.log('LIVE NOW:', liveVideoBlock[1], liveVideoBlock[2]);
      } else {
          console.log('Live badge found but regex failed');
      }
  } else {
      console.log('No live video found');
  }
}
check();
