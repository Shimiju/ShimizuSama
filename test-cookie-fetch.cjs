const fs = require('fs');
const fetch = require('node-fetch') || globalThis.fetch;

async function check() {
  const cookieStr = fs.readFileSync('./lavalink/yt-dlp/cookies.txt', 'utf8');
  const cookies = cookieStr.split('\n')
    .filter(l => !l.startsWith('#') && l.trim().length > 0)
    .map(l => {
      const parts = l.split('\t');
      if (parts.length >= 7) {
         return `${parts[5].trim()}=${parts[6].trim()}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('; ')
    .replace(/[\r\n\t]/g, ''); // Ensure no illegal characters

  const url = 'https://www.youtube.com/channel/UCjCrhhMb-z299D9YSDULL2A/streams?t=' + Date.now();
  console.log("Fetching with cookies...");
  
  try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Cookie': cookies,
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      
      const html = await res.text();
      const match = html.match(/var ytInitialData = (.*?);<\/script>/);
      if (!match) return console.log('No ytInitialData found');
      
      const strData = match[1];
      console.log("Found ytInitialData");
      console.log("Has Live Badge:", strData.includes('BADGE_STYLE_TYPE_LIVE_NOW'));
      
      if (strData.includes('BADGE_STYLE_TYPE_LIVE_NOW')) {
          const liveVideoBlock = strData.match(/{"videoId":"([^"]+)","thumbnail":.*?BADGE_STYLE_TYPE_LIVE_NOW.*?title":{"runs":\[{"text":"(.*?)"}\]/);
          if (liveVideoBlock) {
             console.log("LIVE STREAM ID:", liveVideoBlock[1], "TITLE:", liveVideoBlock[2]);
          }
      } else {
          console.log("No live stream found in HTML.");
      }
  } catch (err) {
      console.error(err);
  }
}
check();
