#!/usr/bin/env node
/**
 * CORS Bypass Server
 * No dependencies - uses only Node.js built-in modules
 *
 * Usage:
 *   node server.js [port] [--no-proxy]
 *
 * Arguments:
 *   port        - Port to listen on (default: 8432)
 *   --no-proxy  - Disable upstream HTTP/HTTPS proxy (connect directly)
 *
 * Environment variables:
 *   HTTP_PROXY - Upstream HTTP proxy for outgoing requests (e.g., http://proxy:8080)
 *   HTTPS_PROXY - Upstream HTTPS proxy for outgoing requests
 *   NO_PROXY - Comma-separated hosts to bypass upstream proxy
 *
 * URL format:
 *   http://localhost:8432/https://example.com/resource
 *
 * Note: For HLS streams, this server rewrites URLs inside m3u8 manifests to go through
 * this bypass server. The bypass base URL is derived from the incoming request's Host header.
 */

const http = require('http');
const https = require('https');
const url = require('url');

// Parse command line args
const args = process.argv.slice(2);
const noProxy = args.includes('--no-proxy');
const positionalArgs = args.filter(a => !a.startsWith('--'));

const PORT = positionalArgs[0] || 8432;

// Rewrite URLs in m3u8/m3u content to go through the bypass server
function rewriteManifestUrls(content, baseUrl, bypassBase) {
    const lines = content.split('\n');
    const rewritten = lines.map(line => {
        const trimmed = line.trim();

        // Skip comments (except #EXT-X-KEY which may have URI)
        if (trimmed.startsWith('#')) {
            // Rewrite URI= in #EXT-X-KEY or other tags
            return line.replace(/URI="([^"]+)"/gi, (match, uri) => {
                if (uri.startsWith('http://') || uri.startsWith('https://')) {
                    return `URI="${bypassBase}${uri}"`;
                }
                // Relative URL - resolve against base
                if (!uri.startsWith('http') && baseUrl) {
                    const resolved = new URL(uri, baseUrl).href;
                    return `URI="${bypassBase}${resolved}"`;
                }
                return match;
            });
        }

        // Empty line
        if (!trimmed) return line;

        // Absolute URL
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return bypassBase + trimmed;
        }

        // Relative URL - resolve against base
        if (baseUrl) {
            try {
                const resolved = new URL(trimmed, baseUrl).href;
                return bypassBase + resolved;
            } catch (e) {
                return line;
            }
        }

        return line;
    });

    return rewritten.join('\n');
}

// Get upstream proxy URL from environment (returns null if --no-proxy or no proxy configured)
function getUpstreamProxyUrl(targetUrl) {
    // --no-proxy flag disables upstream proxy entirely
    if (noProxy) return null;

    const parsed = url.parse(targetUrl);
    const noProxyHosts = (process.env.NO_PROXY || '').split(',').map(h => h.trim()).filter(h => h);

    // Check if target is in NO_PROXY list
    for (const host of noProxyHosts) {
        if (parsed.hostname === host || parsed.hostname.endsWith('.' + host)) {
            return null;
        }
    }

    // Use appropriate upstream proxy based on protocol
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

    // Derive bypass base from incoming request's Host header
    // Only rewrite if Host header is present (security: don't guess localhost)
    const host = clientReq.headers.host;
    const proto = clientReq.headers['x-forwarded-proto'] || 'http';
    const bypassBase = host ? `${proto}://${host}/` : null;

    // Handle CORS preflight
    if (clientReq.method === 'OPTIONS') {
        addCorsHeaders(clientRes, clientReq.headers.origin);
        clientRes.writeHead(204);
        clientRes.end();
        return;
    }

    // Extract target URL from path (remove leading slash)
    let targetUrl = reqUrl.startsWith('/') ? reqUrl.substring(1) : reqUrl;

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

    // Check if we need to use an upstream proxy
    const upstreamProxyUrl = getUpstreamProxyUrl(targetUrl);

    const lib = target.protocol === 'https:' ? https : http;

    const options = {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.path,
        method: clientReq.method,
        headers: headers
    };

    const makeRequest = (opts, lib, redirectCount = 0) => {
        const maxRedirects = 10;

        const proxyReq = lib.request(opts, (proxyRes) => {
            // Handle redirects by following them internally
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                if (redirectCount >= maxRedirects) {
                    clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
                    clientRes.end('Too many redirects');
                    return;
                }

                let redirectUrl = proxyRes.headers.location;
                // Handle relative redirect URLs
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, targetUrl).href;
                }

                console.log(`[REDIRECT] ${proxyRes.statusCode} -> ${redirectUrl}`);
                followRedirect(redirectUrl, redirectCount + 1);
                return;
            }

            const contentType = proxyRes.headers['content-type'] || '';
            const isManifest = contentType.includes('application/vnd.apple.mpegurl') ||
                              contentType.includes('application/x-mpegurl') ||
                              contentType.includes('audio/mpegurl') ||
                              targetUrl.endsWith('.m3u8') ||
                              targetUrl.endsWith('.m3u');

            if (isManifest) {
                // Buffer manifest content and rewrite URLs
                const chunks = [];
                proxyRes.on('data', chunk => chunks.push(chunk));
                proxyRes.on('end', () => {
                    const content = Buffer.concat(chunks).toString('utf-8');
                    // Only rewrite if we have a valid bypass base (Host header was present)
                    const rewritten = bypassBase ? rewriteManifestUrls(content, targetUrl, bypassBase) : content;

                    const respHeaders = { ...proxyRes.headers };
                    delete respHeaders['content-length'];
                    respHeaders['content-length'] = Buffer.byteLength(rewritten);
                    // Ensure CORS headers
                    respHeaders['access-control-allow-origin'] = clientReq.headers.origin || '*';
                    respHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD';
                    respHeaders['access-control-allow-headers'] = 'Content-Type, Authorization, Range, X-Requested-With';
                    respHeaders['access-control-allow-credentials'] = 'true';
                    respHeaders['access-control-expose-headers'] = 'Content-Length, Content-Range, Content-Type';

                    clientRes.writeHead(proxyRes.statusCode, respHeaders);
                    clientRes.end(rewritten);
                });
            } else {
                // Forward status and headers (with CORS)
                const respHeaders = { ...proxyRes.headers };
                respHeaders['access-control-allow-origin'] = clientReq.headers.origin || '*';
                respHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD';
                respHeaders['access-control-allow-headers'] = 'Content-Type, Authorization, Range, X-Requested-With';
                respHeaders['access-control-allow-credentials'] = 'true';
                respHeaders['access-control-expose-headers'] = 'Content-Length, Content-Range, Content-Type';

                clientRes.writeHead(proxyRes.statusCode, respHeaders);
                // Pipe body
                proxyRes.pipe(clientRes);
            }
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

    // Follow redirect internally
    function followRedirect(redirectUrl, redirectCount) {
        let redirectTarget;
        try {
            redirectTarget = url.parse(redirectUrl);
        } catch (e) {
            clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
            clientRes.end('Invalid redirect URL: ' + redirectUrl);
            return;
        }

        const redirectLib = redirectTarget.protocol === 'https:' ? https : http;
        const redirectOpts = {
            hostname: redirectTarget.hostname,
            port: redirectTarget.port || (redirectTarget.protocol === 'https:' ? 443 : 80),
            path: redirectTarget.path,
            method: 'GET',
            headers: filterHeaders(clientReq.headers)
        };

        // Update targetUrl for manifest URL rewriting
        targetUrl = redirectUrl;

        makeRequest(redirectOpts, redirectLib, redirectCount);
    }

    if (upstreamProxyUrl) {
        console.log(`[UPSTREAM PROXY] ${clientReq.method} ${targetUrl} via ${upstreamProxyUrl}`);

        // For HTTPS through upstream proxy, we need CONNECT tunnel
        if (target.protocol === 'https:') {
            const proxyParsed = url.parse(upstreamProxyUrl);
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
                    clientRes.end(`Upstream proxy CONNECT failed: ${res.statusCode}`);
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
                clientRes.end('Upstream proxy connection error: ' + err.message);
            });

            connectReq.end();
        } else {
            // HTTP through upstream proxy
            const proxyParsed = url.parse(upstreamProxyUrl);
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
    console.log('');
    if (noProxy) {
        console.log('Upstream proxy: DISABLED (--no-proxy)');
    } else {
        console.log('Upstream proxy: ENABLED (use --no-proxy to disable)');
    }
    console.log('');
    console.log('Note: HLS manifests will have URLs rewritten using the request Host header');

    if (!noProxy) {
        if (process.env.HTTP_PROXY) {
            console.log('HTTP_PROXY: ' + process.env.HTTP_PROXY);
        }
        if (process.env.HTTPS_PROXY) {
            console.log('HTTPS_PROXY: ' + process.env.HTTPS_PROXY);
        }
        if (process.env.NO_PROXY) {
            console.log('NO_PROXY: ' + process.env.NO_PROXY);
        }
    }
});