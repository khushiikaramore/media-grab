const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
        new URL(targetUrl);
    } catch {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    return new Promise((resolve) => {
        const protocol = targetUrl.startsWith('https') ? https : http;

        const proxyReq = protocol.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
            },
            timeout: 15000,
        }, (proxyRes) => {
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectUrl = proxyRes.headers.location;
                if (redirectUrl.startsWith('/')) {
                    const base = new URL(targetUrl);
                    redirectUrl = base.origin + redirectUrl;
                }
                res.setHeader('Location', '/proxy?url=' + encodeURIComponent(redirectUrl));
                res.status(302).end();
                return resolve();
            }

            if (proxyRes.statusCode !== 200) {
                res.status(502).json({ error: 'Upstream returned ' + proxyRes.statusCode });
                return resolve();
            }

            const contentType = proxyRes.headers['content-type'] || 'application/octet-stream';
            const contentLength = proxyRes.headers['content-length'];

            res.setHeader('Content-Type', contentType);
            if (contentLength) res.setHeader('Content-Length', contentLength);
            res.setHeader('Cache-Control', 'public, max-age=3600');

            proxyRes.pipe(res);
            proxyRes.on('end', () => resolve());
        });

        proxyReq.on('error', (err) => {
            if (!res.headersSent) {
                res.status(502).json({ error: 'Failed to fetch: ' + err.message });
            }
            resolve();
        });

        proxyReq.on('timeout', () => {
            proxyReq.destroy();
            if (!res.headersSent) {
                res.status(504).json({ error: 'Request timed out' });
            }
            resolve();
        });
    });
};
