/**
 * In-memory Mock GitHub Releases API Server for E2E Website Testing.
 * Zero external network calls or npm dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function loadFixture(name) {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

class MockGitHubServer {
  constructor(config = {}) {
    this.fixtures = {
      latestValid: loadFixture('release_latest_valid.json'),
      latestNoApk: loadFixture('release_latest_no_apk.json'),
      latestNoSha: loadFixture('release_latest_no_sha.json'),
      multiApk: loadFixture('release_multi_apk.json'),
      history: loadFixture('releases_history.json'),
      empty: loadFixture('releases_empty.json'),
      error403: loadFixture('error_403_rate_limit.json'),
      error404: loadFixture('error_404_not_found.json'),
      xssPayload: loadFixture('payload_xss_notes.json'),
    };

    this.defaultConfig = {
      owner: config.owner || 'LogarTraders',
      repo: config.repo || 'cold-drink-distribution-app',
      rateLimitLimit: 60,
      rateLimitRemaining: 59,
      rateLimitReset: Math.floor(Date.now() / 1000) + 3600,
      etag: '"a1b2c3d4e5f6g7h8i9j0"',
    };

    this.routes = new Map();
    this.originalFetch = null;
    this.networkError = false;
    this.callLog = [];
    this.reset();
  }

  reset() {
    this.routes.clear();
    this.networkError = false;
    this.callLog = [];

    const baseLatestUrl = `https://api.github.com/repos/${this.defaultConfig.owner}/${this.defaultConfig.repo}/releases/latest`;
    const baseHistoryUrl = `https://api.github.com/repos/${this.defaultConfig.owner}/${this.defaultConfig.repo}/releases`;

    // Default 200 OK routes
    this.setRoute(baseLatestUrl, () => ({
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'etag': this.defaultConfig.etag,
        'x-ratelimit-limit': String(this.defaultConfig.rateLimitLimit),
        'x-ratelimit-remaining': String(this.defaultConfig.rateLimitRemaining),
        'x-ratelimit-reset': String(this.defaultConfig.rateLimitReset),
        'access-control-allow-origin': '*',
      },
      body: this.fixtures.latestValid,
    }));

    this.setRoute(baseHistoryUrl, () => ({
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'etag': '"hist-etag-12345"',
        'x-ratelimit-limit': String(this.defaultConfig.rateLimitLimit),
        'x-ratelimit-remaining': String(this.defaultConfig.rateLimitRemaining),
        'x-ratelimit-reset': String(this.defaultConfig.rateLimitReset),
        'access-control-allow-origin': '*',
      },
      body: this.fixtures.history,
    }));
  }

  install() {
    if (!this.originalFetch) {
      this.originalFetch = globalThis.fetch;
      globalThis.fetch = this.handleFetch.bind(this);
    }
  }

  restore() {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }
  }

  setRoute(urlPattern, handler) {
    this.routes.set(urlPattern, handler);
  }

  setLatestResponse(fixtureData, etag = null) {
    const baseLatestUrl = `https://api.github.com/repos/${this.defaultConfig.owner}/${this.defaultConfig.repo}/releases/latest`;
    this.setRoute(baseLatestUrl, () => ({
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'etag': etag || this.defaultConfig.etag,
        'x-ratelimit-limit': String(this.defaultConfig.rateLimitLimit),
        'x-ratelimit-remaining': String(this.defaultConfig.rateLimitRemaining),
        'x-ratelimit-reset': String(this.defaultConfig.rateLimitReset),
        'access-control-allow-origin': '*',
      },
      body: fixtureData,
    }));
  }

  setHistoryResponse(fixtureData) {
    const baseHistoryUrl = `https://api.github.com/repos/${this.defaultConfig.owner}/${this.defaultConfig.repo}/releases`;
    this.setRoute(baseHistoryUrl, () => ({
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'etag': '"hist-etag-dynamic"',
        'x-ratelimit-limit': String(this.defaultConfig.rateLimitLimit),
        'x-ratelimit-remaining': String(this.defaultConfig.rateLimitRemaining),
        'x-ratelimit-reset': String(this.defaultConfig.rateLimitReset),
        'access-control-allow-origin': '*',
      },
      body: fixtureData,
    }));
  }

  simulateRateLimit(resetMinutes = 30) {
    const resetTimestamp = Math.floor(Date.now() / 1000) + (resetMinutes * 60);
    const handler = () => ({
      status: 403,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetTimestamp),
        'access-control-allow-origin': '*',
      },
      body: this.fixtures.error403,
    });
    this.setRoute(`https://api.github.com/repos/${this.defaultConfig.owner}/${this.defaultConfig.repo}/releases/latest`, handler);
    this.setRoute(`https://api.github.com/repos/${this.defaultConfig.owner}/${this.defaultConfig.repo}/releases`, handler);
  }

  simulate404() {
    const handler = () => ({
      status: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
      },
      body: this.fixtures.error404,
    });
    this.setRoute(`https://api.github.com/repos/${this.defaultConfig.owner}/${this.defaultConfig.repo}/releases/latest`, handler);
    this.setRoute(`https://api.github.com/repos/${this.defaultConfig.owner}/${this.defaultConfig.repo}/releases`, handler);
  }

  simulateNetworkFailure() {
    this.networkError = true;
  }

  clearNetworkFailure() {
    this.networkError = false;
  }

  async handleFetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : input.url;
    const urlObj = new URL(urlStr);
    const normalizedUrl = `${urlObj.origin}${urlObj.pathname}`;

    this.callLog.push({ url: urlStr, method: init.method || 'GET', headers: init.headers || {} });

    if (this.networkError) {
      throw new TypeError('Failed to fetch: Network connectivity failure (Simulated)');
    }

    const handler = this.routes.get(normalizedUrl);
    if (!handler) {
      throw new Error(`[Offline Safety Lock] Unmocked network call attempted to: ${urlStr}. Live network calls are strictly prohibited.`);
    }

    // Conditional ETag checking
    const reqHeaders = init.headers || {};
    const ifNoneMatch = reqHeaders['If-None-Match'] || reqHeaders['if-none-match'];
    const mockResponseData = handler(init);

    if (ifNoneMatch && mockResponseData.headers && mockResponseData.headers.etag === ifNoneMatch) {
      return this.createResponse('', 304, 'Not Modified', mockResponseData.headers);
    }

    const status = mockResponseData.status || 200;
    const statusText = status === 200 ? 'OK' : status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : 'Error';
    const bodyStr = mockResponseData.body !== null && mockResponseData.body !== undefined ? JSON.stringify(mockResponseData.body) : '';

    return this.createResponse(bodyStr, status, statusText, mockResponseData.headers);
  }

  createResponse(bodyStr, status, statusText, headersObj) {
    const headersMap = new Map(Object.entries(headersObj || {}));
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: {
        get: (key) => headersMap.get(key.toLowerCase()) || null,
        has: (key) => headersMap.has(key.toLowerCase()),
      },
      json: async () => JSON.parse(bodyStr || '{}'),
      text: async () => bodyStr,
    };
  }
}

module.exports = { MockGitHubServer, loadFixture };
