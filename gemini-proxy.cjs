const http = require('http');
const https = require('https');

const PORT = 3006;

async function performRequest(options, body, retryCount = 0) {
    const MAX_RETRIES = 5; // Limiti 5'e çıkardım
    return new Promise((resolve, reject) => {
        const proxyReq = https.request(options, proxyRes => {
            let resBody = '';
            proxyRes.on('data', c => { resBody += c; });
            proxyRes.on('end', () => {
                // 503 (Busy) veya 429 (Rate Limit) durumunda ısrarla denemeye devam et
                if ((proxyRes.statusCode === 503 || proxyRes.statusCode === 429) && retryCount < MAX_RETRIES) {
                    const delay = Math.pow(2, retryCount) * 1000;
                    console.warn(`[GeminiProxy] Google Meşgul (${proxyRes.statusCode}). ${delay}ms sonra tekrar deniyorum... (${retryCount + 1}/${MAX_RETRIES})`);
                    setTimeout(() => {
                        performRequest(options, body, retryCount + 1).then(resolve).catch(reject);
                    }, delay);
                } else {
                    resolve({ statusCode: proxyRes.statusCode, headers: proxyRes.headers, body: resBody });
                }
            });
        });

        proxyReq.on('error', err => {
            if (retryCount < MAX_RETRIES) {
                console.warn(`[GeminiProxy] Ağ Hatası: ${err.message}. Yeniden deneniyor...`);
                setTimeout(() => {
                    performRequest(options, body, retryCount + 1).then(resolve).catch(reject);
                }, 1000);
            } else {
                reject(err);
            }
        });
        proxyReq.write(body);
        proxyReq.end();
    });
}

const server = http.createServer(async (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    
    req.on('end', async () => {
        try {
            if (!body) { res.writeHead(200); return res.end('OK'); }

            let payload = JSON.parse(body);
            let isAnthropicFormat = (req.url.includes('/messages') || (payload.messages && payload.system));
            let originalModel = payload.model;

            if (isAnthropicFormat) {
                console.log(`\n[GeminiProxy] Anthropic -> OpenAI Çevrimi (${originalModel})`);
                if (payload.tools) delete payload.tools; 

                const messages = [];
                if (payload.system) messages.push({ role: 'system', content: payload.system });
                if (payload.messages) {
                    payload.messages.forEach(msg => {
                        let content = msg.content;
                        if (Array.isArray(content)) {
                            content = content.map(c => c.text || "").join('\n');
                        }
                        messages.push({ role: msg.role, content: content || "" });
                    });
                }

                payload = {
                    model: originalModel,
                    messages: messages,
                    max_tokens: Math.min(payload.max_tokens || 4096, 8192),
                    stream: false 
                };
            }

            const newBody = JSON.stringify(payload);
            const headers = { ...req.headers };
            headers['host'] = 'generativelanguage.googleapis.com';
            headers['content-length'] = Buffer.byteLength(newBody);
            delete headers['accept-encoding'];

            const options = {
                hostname: 'generativelanguage.googleapis.com',
                port: 443,
                path: '/v1beta/openai/chat/completions',
                method: 'POST',
                headers: headers
            };

            console.log(`[GeminiProxy] İletiliyor... (Protokol: ${isAnthropicFormat ? 'Anthropic' : 'OpenAI'})`);

            try {
                const result = await performRequest(options, newBody);
                console.log(`[GeminiProxy] Nihai Yanıt Kodu: ${result.statusCode}`);

                if (result.statusCode === 200 && isAnthropicFormat) {
                    const openAIRes = JSON.parse(result.body);
                    const assistantMsg = (openAIRes.choices && openAIRes.choices[0] && openAIRes.choices[0].message) || {};
                    const content = assistantMsg.content || ""; 

                    const anthropicRes = {
                        id: openAIRes.id || `msg_${Date.now()}`,
                        type: "message", role: "assistant", model: originalModel,
                        content: [{ type: "text", text: String(content) || "İstek şu an işlenemedi, lütfen tekrar edin." }],
                        stop_reason: "end_turn", stop_sequence: null,
                        usage: {
                            input_tokens: (openAIRes.usage && openAIRes.usage.prompt_tokens) || 0,
                            output_tokens: (openAIRes.usage && openAIRes.usage.completion_tokens) || 0
                        }
                    };
                    
                    const finalBody = JSON.stringify(anthropicRes);
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(finalBody) });
                    return res.end(finalBody);
                }

                res.writeHead(result.statusCode, result.headers);
                res.end(result.body);

            } catch (err) {
                console.error('[GeminiProxy] İstek Hatası:', err.message);
                res.writeHead(502);
                res.end('Proxy Error: ' + err.message);
            }

        } catch (e) {
            console.error('[GeminiProxy] Hata:', e.message);
        }
    });
});

process.on('uncaughtException', (err) => { console.error('[GeminiProxy] ÇÖKME ÖNLENDİ:', err.message); });

server.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ Gemini Proxy v6 (Hard Retry) Aktif: http://127.0.0.1:${PORT}`);
});
