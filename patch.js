const fs = require('fs');
let content = fs.readFileSync('src/index.js', 'utf8');

const oldBlock = \pp.use('/stream/', (req, res, next) => {
  const originalEnd = res.end;
  res.end = function(chunk, encoding, callback) {
    if (chunk) {
      let isBuffer = Buffer.isBuffer(chunk);
      let bodyString = isBuffer ? chunk.toString('utf8') : chunk;

      if (typeof bodyString === 'string') {
        try {
          const body = JSON.parse(bodyString);
          if (body && Array.isArray(body.streams)) {
            const host = req.get('host');
            const proto = req.headers['x-forwarded-proto'] || req.protocol;
            const dynamicBaseUrl = \\\\\\://\\\System.Management.Automation.Internal.Host.InternalHost\\\;
            
            let modified = false;
            body.streams.forEach(s => {
              // Fix externalUrl
              if (s.externalUrl && s.externalUrl.startsWith('/watch')) {
                s.externalUrl = \\\\\\\\\\\\;
                modified = true;
              } else if (BASE_URL && s.externalUrl && s.externalUrl.startsWith(BASE_URL)) {
                s.externalUrl = s.externalUrl.replace(BASE_URL, dynamicBaseUrl);
                modified = true;
              }
              
              // Fix direct stream url
              if (s.url && s.url.startsWith('/api/hls')) {
                s.url = \\\\\\\\\\\\;
                modified = true;
              } else if (BASE_URL && s.url && s.url.startsWith(BASE_URL)) {
                s.url = s.url.replace(BASE_URL, dynamicBaseUrl);
                modified = true;
              }
            });
            
            if (modified) {
              bodyString = JSON.stringify(body);
              if (isBuffer) {
                chunk = Buffer.from(bodyString, 'utf8');
              } else {
                chunk = bodyString;
              }
              res.setHeader('Content-Length', Buffer.byteLength(bodyString));
            }
          }
        } catch (e) {
          // ignore parsing errors
        }
      }
    }
    originalEnd.call(res, chunk, encoding, callback);
  };
  next();
});\;

const newBlock = \pp.use('/stream/', (req, res, next) => {
  const originalWrite = res.write;
  const originalEnd = res.end;
  let chunks = [];

  res.write = function (chunk) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  };

  res.end = function (chunk, encoding, callback) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

    if (chunks.length > 0) {
      const bodyBuffer = Buffer.concat(chunks);
      const bodyString = bodyBuffer.toString('utf8');
      
      try {
        const body = JSON.parse(bodyString);
        if (body && Array.isArray(body.streams)) {
          const host = req.get('host');
          const proto = req.headers['x-forwarded-proto'] || req.protocol;
          const dynamicBaseUrl = \\\\\\://\\\System.Management.Automation.Internal.Host.InternalHost\\\;
          
          let modified = false;
          body.streams.forEach(s => {
            if (s.externalUrl && s.externalUrl.startsWith('/watch')) {
              s.externalUrl = \\\\\\\\\\\\;
              modified = true;
            } else if (BASE_URL && s.externalUrl && s.externalUrl.startsWith(BASE_URL)) {
              s.externalUrl = s.externalUrl.replace(BASE_URL, dynamicBaseUrl);
              modified = true;
            }
            
            if (s.url && s.url.startsWith('/api/hls')) {
              s.url = \\\\\\\\\\\\;
              modified = true;
            } else if (BASE_URL && s.url && s.url.startsWith(BASE_URL)) {
              s.url = s.url.replace(BASE_URL, dynamicBaseUrl);
              modified = true;
            }
          });
          
          if (modified) {
            const newBodyString = JSON.stringify(body);
            const newBuffer = Buffer.from(newBodyString, 'utf8');
            res.setHeader('Content-Length', newBuffer.length);
            return originalEnd.call(res, newBuffer, 'utf8', callback);
          }
        }
      } catch (e) { }
    }
    
    const finalBuffer = Buffer.concat(chunks);
    originalEnd.call(res, finalBuffer, encoding, callback);
  };
  
  next();
});\;

const startIdx = content.indexOf(\pp.use('/stream/', (req, res, next) => {\);
const endIdx = content.indexOf(\});\, startIdx) + 3;

if (startIdx !== -1) {
    content = content.substring(0, startIdx) + newBlock + content.substring(endIdx);
    fs.writeFileSync('src/index.js', content);
    console.log('Patched');
} else {
    console.log('Not found');
}
\
