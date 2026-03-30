#!/usr/bin/env node
/**
 * Simple CORS Bypass Server
 * No dependencies - uses only Node.js built-in modules
 *
 * Usage:
 *   node server.js [port]
 *
 * Environment variables:
 *   PORT - Port to listen on (default: 8432)
 *   HTTP_PROXY - HTTP proxy to use for outgoing requests (e.g., http://proxy:8080)
 *   HTTPS_PROXY - HTTPS proxy to use for outgoing requests
 *   NO_PROXY - Comma-separated list of hosts to bypass proxy
 *
 * URL format:
 *   http://localhost:8432/https://example.com/resource
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || process.argv[2] || 8432;

// Parse proxy URL from environment
function getProxyUrl(targetUrl) {
    const parsed = url.parse(targetUrl);
    const noProxy = (process.env.NO_PROXY || '').split(',').map(h => h.trim()).filter(h => h);

    // Check if target is in NO_PROXY list
    for (const host of noProxy) {
        if (parsed.hostname === host || parsed.hostname.endsWith('.' + host)) {
            return null;
        }
    }

    // Use appropriate proxy based on protocol
    if (parsed.protocol === 'https:') {
        return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
    } else {
        return process.env.HTTP_PROXY || null;
    }
}

// Filter headers that shouldn't be forwarded
function filterHeaders(headers) {
    const filtered = {};
    const skipHeaders = ['host', 'connection', 'content-length'];

    for (const [key, value] of Object.entries(headers)) {
        if (!skipHeaders.includes(key.toLowerCase())) {
            filtered[key] = value;
        }
    }

    return filtered;
}

// CORS headers to add to all responses
function addCorsHeaders(res, reqOrigin) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
}

// Handle incoming request
function handleRequest(clientReq, clientRes) {
    const reqUrl = clientReq.url;

    // Handle CORS preflight
    if (clientReq.method === 'OPTIONS') {
        addCorsHeaders(clientRes, clientReq.headers.origin);
        clientRes.writeHead(204);
        clientRes.end();
        return;
    }

    // Extract target URL from path (remove leading slash)
    const targetUrl = reqUrl.startsWith('/') ? reqUrl.substring(1) : reqUrl;

    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
        clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
        clientRes.end('Usage: http://localhost:' + PORT + '/https://example.com/resource');
        return;
    }

    // Validate URL
    let target;
    try {
        target = url.parse(targetUrl);
        if (!target.protocol || !target.host) {
            throw new Error('Invalid URL');
        }
    } catch (e) {
        clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
        clientRes.end('Invalid target URL: ' + targetUrl);
        return;
    }

    // Add CORS headers
    addCorsHeaders(clientRes, clientReq.headers.origin);

    // Prepare headers
    const headers = filterHeaders(clientReq.headers);

    // Check if we need to use a proxy
    const proxyUrl = getProxyUrl(targetUrl);

    const lib = target.protocol === 'https:' ? https : http;

    const options = {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.path,
        method: clientReq.method,
        headers: headers
    };

    const makeRequest = (opts, lib) => {
        const proxyReq = lib.request(opts, (proxyRes) => {
            // Forward status and headers
            clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);

            // Pipe body
            proxyRes.pipe(clientRes);
        });

        proxyReq.on('error', (err) => {
            console.error('[ERROR]', err.message);
            clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
            clientRes.end('Error: ' + err.message);
        });

        // Pipe client body to target
        clientReq.pipe(proxyReq);

        return proxyReq;
    };

    if (proxyUrl) {
        console.log(`[PROXY] ${clientReq.method} ${targetUrl} via ${proxyUrl}`);

        // For HTTPS through proxy, we need CONNECT tunnel
        if (target.protocol === 'https:') {
            const proxyParsed = url.parse(proxyUrl);
            const proxyPort = proxyParsed.port || 80;

            const connectOptions = {
                host: proxyParsed.hostname,
                port: proxyPort,
                method: 'CONNECT',
                path: `${target.hostname}:${options.port}`
            };

            const connectReq = http.request(connectOptions);

            connectReq.on('connect', (res, socket) => {
                if (res.statusCode !== 200) {
                    clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
                    clientRes.end(`Proxy CONNECT failed: ${res.statusCode}`);
                    return;
                }

                // Create TLS tunnel
                const tlsSocket = require('tls').connect({
                    socket: socket,
                    servername: target.hostname
                });

                tlsSocket.on('error', (err) => {
                    console.error('[TLS ERROR]', err.message);
                    clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
                    clientRes.end('TLS error: ' + err.message);
                });

                // Manually write HTTP request
                const requestLine = `${clientReq.method} ${target.path} HTTP/1.1\r\n`;
                const headerLines = Object.entries(headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\r\n');
                const fullRequest = requestLine + headerLines + '\r\n\r\n';

                tlsSocket.write(fullRequest);

                tlsSocket.on('data', (chunk) => {
                    clientRes.write(chunk);
                });

                tlsSocket.on('end', () => {
                    clientRes.end();
                });

                clientReq.pipe(tlsSocket);
            });

            connectReq.on('error', (err) => {
                console.error('[CONNECT ERROR]', err.message);
                clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
                clientRes.end('Proxy connection error: ' + err.message);
            });

            connectReq.end();
        } else {
            // HTTP through proxy
            const proxyParsed = url.parse(proxyUrl);
            const proxyOpts = {
                hostname: proxyParsed.hostname,
                port: proxyParsed.port || 80,
                path: targetUrl,
                method: clientReq.method,
                headers: headers
            };

            makeRequest(proxyOpts, http);
        }
    } else {
        console.log(`[DIRECT] ${clientReq.method} ${targetUrl}`);
        makeRequest(options, lib);
    }
}

// Start server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
    console.log(`CORS Bypass Server running on http://localhost:${PORT}`);
    console.log('Usage: http://localhost:' + PORT + '/https://example.com/resource');

    if (process.env.HTTP_PROXY) {
        console.log('HTTP_PROXY: ' + process.env.HTTP_PROXY);
    }
    if (process.env.HTTPS_PROXY) {
        console.log('HTTPS_PROXY: ' + process.env.HTTPS_PROXY);
    }
    if (process.env.NO_PROXY) {
        console.log('NO_PROXY: ' + process.env.NO_PROXY);
    }
});