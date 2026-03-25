const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4'
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, urlPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Try pages/ subfolder
  if (urlPath.startsWith('/moveathens/')) {
    const pageName = urlPath.replace('/moveathens/', '');
    const pagePath = path.join(ROOT, 'moveathens', 'pages', pageName);
    const pagePathHtml = pagePath + '.html';
    for (const p of [pagePath, pagePathHtml]) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(p).pipe(res);
        return;
      }
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3457, () => console.log('Static server on http://localhost:3457'));
