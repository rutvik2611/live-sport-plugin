import fetch from 'node-fetch';

const url = "https://lb13.strmd.st/secure/FpIzlECiFeUejZmuFOmoXFpQUoimzclb/echo/stream/world-rally-championship-estonia-world-rally-championship-2026-season-racing-0059/1/playlist.m3u8";
const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'Referer': 'https://embed.st/',
    'Origin': 'https://embed.st',
    'Accept': '*/*'
};

fetch(url, { headers })
    .then(res => res.text())
    .then(text => console.log("Success:", text.substring(0, 100)))
    .catch(err => console.error("Error:", err));
