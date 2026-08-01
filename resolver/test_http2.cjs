const http2 = require('http2');

const url = new URL("https://lb13.strmd.st/secure/FpIzlECiFeUejZmuFOmoXFpQUoimzclb/echo/stream/world-rally-championship-estonia-world-rally-championship-2026-season-racing-0059/1/playlist.m3u8");

const client = http2.connect(url.origin);
const req = client.request({
    ':path': url.pathname + url.search,
    ':method': 'GET',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Referer': 'https://embed.st/',
    'Origin': 'https://embed.st'
});

let data = '';
req.on('response', (headers, flags) => {
    console.log(headers[':status']);
});
req.on('data', chunk => data += chunk);
req.on('end', () => {
    console.log("Success HTTP/2:", data);
    client.close();
});
req.on('error', err => {
    console.error("HTTP/2 Error:", err);
    client.close();
});
req.end();
