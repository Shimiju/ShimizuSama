const fetch = require('node-fetch') || globalThis.fetch;

async function check() {
  const res = await fetch('https://www.youtube.com/@JudeShimizu/streams', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
  });
  const html = await res.text();
  const match = html.match(/var ytInitialData = (.*);<\/script>/);
  if (!match) return console.log('No ytInitialData');
  
  const data = JSON.parse(match[1]);
  // fs.writeFileSync('ytData.json', JSON.stringify(data, null, 2));
  
  try {
    const tabs = data.contents.twoColumnBrowseResultsRenderer.tabs;
    const streamsTab = tabs.find(t => t.tabRenderer?.title === 'Live' || t.tabRenderer?.title === 'Streams');
    
    if (!streamsTab) {
      // Sometimes it's the only tab or named differently, or we can just deep search for "LIVE" badge
      console.log('No streams tab found');
    }
    
    // Let's do a deep search for videoId and thumbnailOverlayTimeStatusRenderer with "LIVE"
    const strData = JSON.stringify(data);
    const videoMatches = [...strData.matchAll(/"videoId":"([^"]+)"/g)];
    const uniqueVideos = [...new Set(videoMatches.map(m => m[1]))];
    
    console.log('Found video IDs:', uniqueVideos.slice(0, 5));
    
    // We can use regex on the raw string for BADGE_STYLE_TYPE_LIVE_NOW
    if (strData.includes('BADGE_STYLE_TYPE_LIVE_NOW')) {
        // Find the block containing this badge.
        const liveVideoBlock = strData.match(/{"videoId":"([^"]+)","thumbnail":.*?BADGE_STYLE_TYPE_LIVE_NOW.*?title":{"runs":\[{"text":"(.*?)"}\]/);
        if (liveVideoBlock) {
            console.log('LIVE NOW:', liveVideoBlock[1], liveVideoBlock[2]);
        } else {
            console.log('Live badge found but regex failed');
        }
    } else {
        console.log('No live video found');
    }
  } catch (e) {
    console.error(e);
  }
}
check();
