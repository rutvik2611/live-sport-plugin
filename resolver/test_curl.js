import { pull } from './src/wire/curl.js';

const url = "https://lb13.strmd.st/secure/FpIzlECiFeUejZmuFOmoXFpQUoimzclb/echo/stream/world-rally-championship-estonia-world-rally-championship-2026-season-racing-0059/1/playlist.m3u8";
const slot = { referer: 'https://embed.st/', origin: 'https://embed.st' };

pull(url, slot).then(res => {
    console.log("Success:", res.toString());
}).catch(err => {
    console.error("Error:", err);
});
