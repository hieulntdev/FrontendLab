'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const PROJECT_ROOT = __dirname;
const DASHBOARD_ROOT = path.join(PROJECT_ROOT, 'dashboard');
const MODULES_ROOT = path.join(PROJECT_ROOT, 'modules');
const HOST = process.env.HOST || '127.0.0.1';
const requestedPort = Number.parseInt(process.env.PORT || '3000', 10);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536
  ? requestedPort
  : 3000;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function humanizeFolderName(folderName) {
  return folderName
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

function warn(message) {
  console.warn(`[WARN] ${message}`);
}

async function readMetadata(moduleDirectory, moduleId) {
  const metadataPath = path.join(moduleDirectory, 'module.json');

  try {
    const contents = await fsp.readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(contents);

    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
      warn(`Invalid module metadata: ${moduleId}`);
      return {};
    }

    return metadata;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      warn(`Invalid module metadata: ${moduleId} (${error.message})`);
    }
    return {};
  }
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function discoverModules() {
  let entries;

  try {
    entries = await fsp.readdir(MODULES_ROOT, { withFileTypes: true });
  } catch (error) {
    warn(`Unable to read modules directory (${error.message})`);
    return [];
  }

  const modules = await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      return null;
    }

    const moduleDirectory = path.join(MODULES_ROOT, entry.name);
    const indexPath = path.join(moduleDirectory, 'index.html');

    try {
      const indexStats = await fsp.stat(indexPath);
      if (!indexStats.isFile()) {
        warn(`Skipped folder without index.html: ${entry.name}`);
        return null;
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        warn(`Skipped folder without index.html: ${entry.name}`);
      } else {
        warn(`Unable to inspect module: ${entry.name} (${error.message})`);
      }
      return null;
    }

    const metadata = await readMetadata(moduleDirectory, entry.name);

    return {
      id: entry.name,
      name: optionalText(metadata.name) || humanizeFolderName(entry.name),
      description: optionalText(metadata.description),
      category: optionalText(metadata.category),
      path: `/modules/${encodeURIComponent(entry.name)}/index.html`
    };
  }));

  return modules
    .filter(Boolean)
    .sort((first, second) => first.name.localeCompare(second.name, undefined, {
      sensitivity: 'base'
    }));
}

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function sendText(response, statusCode, message) {
  const body = Buffer.from(message);
  response.writeHead(statusCode, {
    'Content-Length': body.length,
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function isInsideRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function serveStatic(request, response, root, rawPath) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    sendText(response, 400, 'Bad Request');
    return;
  }

  if (decodedPath.includes('\0')) {
    sendText(response, 400, 'Bad Request');
    return;
  }

  const segments = decodedPath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith('.'))) {
    sendText(response, 404, 'Not Found');
    return;
  }

  const rootRealPath = await fsp.realpath(root);
  let candidate = path.resolve(root, `.${path.sep}${decodedPath}`);

  if (!isInsideRoot(root, candidate)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  let stats;
  try {
    stats = await fsp.stat(candidate);
    if (stats.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
      stats = await fsp.stat(candidate);
    }

    if (!stats.isFile()) {
      sendText(response, 404, 'Not Found');
      return;
    }

    const candidateRealPath = await fsp.realpath(candidate);
    if (!isInsideRoot(rootRealPath, candidateRealPath)) {
      sendText(response, 403, 'Forbidden');
      return;
    }

    candidate = candidateRealPath;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      sendText(response, 404, 'Not Found');
      return;
    }
    throw error;
  }

  const contentType = MIME_TYPES[path.extname(candidate).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, {
    'Content-Length': stats.size,
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff'
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = fs.createReadStream(candidate);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendText(response, 405, 'Method Not Allowed');
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    } catch {
      sendText(response, 400, 'Bad Request');
      return;
    }

    if (pathname === '/') {
      response.writeHead(302, { Location: '/dashboard/' });
      response.end();
      return;
    }

    if (pathname === '/dashboard') {
      response.writeHead(302, { Location: '/dashboard/' });
      response.end();
      return;
    }

    if (pathname === '/api/modules') {
      sendJson(response, 200, await discoverModules());
      return;
    }

    if (pathname.startsWith('/dashboard/')) {
      await serveStatic(request, response, DASHBOARD_ROOT, pathname.slice('/dashboard/'.length));
      return;
    }

    if (pathname.startsWith('/modules/')) {
      await serveStatic(request, response, MODULES_ROOT, pathname.slice('/modules/'.length));
      return;
    }

    sendText(response, 404, 'Not Found');
  } catch (error) {
    console.error('[ERROR]', error);
    if (!response.headersSent) {
      sendText(response, 500, 'Internal Server Error');
    } else {
      response.destroy();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FrontendLab is running at http://${HOST}:${PORT}`);
});
