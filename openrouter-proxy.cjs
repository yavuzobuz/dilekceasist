const http = require('http');
const https = require('https');

const PORT = 3005;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  
  req.on('end', () => {
    try {
      if (!body) {
        res.writeHead(200);
        return res.end('OK');
      }

      const payload = JSON.parse(body);
      
      // max_tokens değerini OpenRouter limitinize (örn: 1600) indirgeyin
      if (payload.max_tokens && payload.max_tokens > 1600) {
        payload.max_tokens = 1600;
        console.log(`[Proxy] max_tokens sınırı 1600'e düşürüldü.`);
      }

      const newBody = JSON.stringify(payload);
      
      // İstek başlıklarını yeni içerik boyutuna göre ayarla
      const headers = { ...req.headers };
      headers['host'] = 'openrouter.ai';
      headers['content-length'] = Buffer.byteLength(newBody);
      // Sıkıştırmayı kapat (proxy'de kolay okunması için veya hataları önlemek için)
      delete headers['accept-encoding'];

      let targetPath = req.url;
      if (!targetPath.startsWith('/api')) {
        targetPath = '/api' + targetPath;
      }

      const options = {
        hostname: 'openrouter.ai',
        port: 443,
        path: targetPath,
        method: req.method,
        headers: headers
      };

      console.log(`[Proxy] İletiliyor: ${req.method} ${targetPath}`);

      const proxyReq = https.request(options, proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', err => {
        console.error('[Proxy] İstek Hatası:', err.message);
        res.writeHead(500);
        res.end('Proxy Error');
      });

      proxyReq.write(newBody);
      proxyReq.end();

    } catch (e) {
      console.error('[Proxy] JSON Ayrıştırma Hatası:', e.message);
      res.writeHead(400);
      res.end('Invalid JSON');
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ OpenRouter Token Limitleyici Proxy çalışıyor: http://127.0.0.1:${PORT}`);
  console.log(`CCS ayarlarınızda ANTHROPIC_BASE_URL değerini http://127.0.0.1:${PORT} olarak güncellemeyi unutmayın!`);
});
