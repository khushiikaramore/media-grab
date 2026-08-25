const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
        new URL(targetUrl);
    } catch {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    try {
        const protocol = targetUrl.startsWith('https') ? https : http;

        const proxyReq = protocol.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Referer': new URL(targetUrl).origin + '/',
            },
            timeout: 15000,
        }, (proxyRes) => {
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectUrl = proxyRes.headers.location;
                if (redirectUrl.startsWith('/')) {
                    const base = new URL(targetUrl);
                    redirectUrl = base.origin + redirectUrl;
                }
                return res.redirect('/proxy?url=' + encodeURIComponent(redirectUrl));
            }

            if (proxyRes.statusCode !== 200) {
                return res.status(proxyRes.status).json({ error: `Upstream returned ${proxyRes.statusCode}` });
            }

            const contentType = proxyRes.headers['content-type'] || 'application/octet-stream';
            const contentLength = proxyRes.headers['content-length'];

            res.setHeader('Content-Type', contentType);
            if (contentLength) res.setHeader('Content-Length', contentLength);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Disposition', 'inline');

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            if (!res.headersSent) {
                res.status(502).json({ error: 'Failed to fetch: ' + err.message });
            }
        });

        proxyReq.on('timeout', () => {
            proxyReq.destroy();
            if (!res.headersSent) {
                res.status(504).json({ error: 'Request timed out' });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/info', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
        new URL(targetUrl);
    } catch {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    try {
        const protocol = targetUrl.startsWith('https') ? https : http;

        const headReq = protocol.request(targetUrl, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
            },
            timeout: 10000,
        }, (headRes) => {
            if (headRes.statusCode >= 300 && headRes.statusCode < 400 && headRes.headers.location) {
                let redirectUrl = headRes.headers.location;
                if (redirectUrl.startsWith('/')) {
                    const base = new URL(targetUrl);
                    redirectUrl = base.origin + redirectUrl;
                }
                return res.redirect('/info?url=' + encodeURIComponent(redirectUrl));
            }

            const contentType = headRes.headers['content-type'] || 'unknown';
            const contentLength = headRes.headers['content-length'] || '0';
            const fileName = path.basename(new URL(targetUrl).pathname) || 'download';

            res.json({
                contentType,
                contentLength: parseInt(contentLength),
                fileName,
                finalUrl: targetUrl,
            });
        });

        headReq.on('error', (err) => {
            res.status(502).json({ error: 'Failed to fetch info: ' + err.message });
        });

        headReq.on('timeout', () => {
            headReq.destroy();
            res.status(504).json({ error: 'Request timed out' });
        });

        headReq.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`MediaGrab server running at http://localhost:${PORT}`);
});
