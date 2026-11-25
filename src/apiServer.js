// ===========================================
// Op65-Agent Local HTTP API Server
// Connects roleinhelp.html to geminiService & scholarService
// ===========================================

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { generateResponseWithResearch } = require('./services/geminiService');
const { logger } = require('./utils/logger');

const PORT = process.env.PORT || 3065;
const SERVER_START_TIME = Date.now();

// ── Simple in-memory rate limiter ──
const rateLimitMap = new Map();
const RATE_LIMIT_MAX   = 10;  // max requests per window
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, start: now };
    if (now - entry.start > RATE_LIMIT_WINDOW) {
        entry.count = 1; entry.start = now;
    } else {
        entry.count++;
    }
    rateLimitMap.set(ip, entry);
    // Cleanup old entries every 500 requests
    if (rateLimitMap.size > 500) {
        for (const [k, v] of rateLimitMap) {
            if (now - v.start > RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
        }
    }
    return entry.count <= RATE_LIMIT_MAX;
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const server = http.createServer(async (req, res) => {
    setCors(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // ── Health / status endpoint ──
    if ((url.pathname === '/health' || url.pathname === '/api/status') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            status: 'ok',
            engine: 'RoleInHelp Academic Engine v2',
            version: '2.0.0',
            uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // ── Main Analysis Endpoint ──
    if (url.pathname === '/api/analyze' && req.method === 'POST') {
        // Rate limiting (support reverse proxies like Render / Cloudflare Tunnel / ngrok)
        const forwarded = req.headers['x-forwarded-for'];
        const clientIp = (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIp)) {
            res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Terlalu banyak permintaan. Coba lagi dalam 1 menit.' }));
            return;
        }
        let body = '';
        let bodyBytes = 0;
        const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB limit for image uploads
        req.on('data', chunk => {
            bodyBytes += chunk.length;
            if (bodyBytes > MAX_BODY_BYTES) {
                res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Ukuran lampiran terlalu besar (maksimal 10 MB).' }));
                req.destroy();
                return;
            }
            body += chunk;
        });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                const question = data.question || '';
                const userName = data.userName || 'Mahasiswa';
                const mode = data.mode || 'umum';
                const media = data.media || null; // { data: base64, mimeType: 'image/jpeg' }

                if (!question && !media) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Pertanyaan atau lampiran foto wajib diisi.' }));
                    return;
                }

                logger.info(`🌐 [API Request] Analisis untuk ${userName}: "${(question || '').substring(0, 50)}..." [Mode: ${mode}]`);

                const result = await generateResponseWithResearch(question, userName, { media, mode });

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    success: true,
                    answer: result.answer,
                    sources: result.sources,
                    cached: result.sources && result.sources.cached === true,
                    engine: 'RoleInHelp',
                    timestamp: new Date().toISOString()
                }));
            } catch (err) {
                logger.error(`API Error: ${err.message}`);
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // Serve roleinhelp.html if accessed directly
    if (url.pathname === '/' || url.pathname === '/roleinhelp.html') {
        const filePath = path.join(__dirname, '..', 'roleinhelp.html');
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File roleinhelp.html tidak ditemukan');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint tidak ditemukan' }));
});

function startServer(port = PORT) {
    server.listen(port, () => {
        logger.info(`🚀 Op65-Agent API Server berjalan di http://localhost:${port}`);
        const os = require('os');
        const nets = os.networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
                if (net.family === 'IPv4' && !net.internal) {
                    logger.info(`📡 Akses jaringan lokal (satu Wi-Fi): http://${net.address}:${port}`);
                }
            }
        }
    });
    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer, server };
