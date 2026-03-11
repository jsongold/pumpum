// background.js — ferrid v0.2
// Security: uses storage.local (not sync), sanitizes errors
var cache = new Map();
var CACHE_TTL = 60000;

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === "NOTION_API") {
    handleNotionRequest(msg).then(sendResponse).catch(function(e) { sendResponse({ error: sanitizeError(e.message) }); });
    return true;
  }
  if (msg.type === "GET_SETTINGS") {
    chrome.storage.local.get(["notionToken", "notionPageId", "notionPageTitle", "format", "transferMode"], sendResponse);
    return true;
  }
  if (msg.type === "SAVE_SETTINGS") {
    var ALLOWED_KEYS = ["notionToken", "notionPageId", "notionPageTitle", "format", "transferMode"];
    var filtered = {};
    ALLOWED_KEYS.forEach(function(k) { if (msg.payload && k in msg.payload) filtered[k] = msg.payload[k]; });
    chrome.storage.local.set(filtered, function() { sendResponse({ ok: true }); });
    return true;
  }
});

function sanitizeError(msg) {
  if (!msg) return "Unknown error";
  // Strip any token-like strings from error messages
  return String(msg).replace(/ntn_[A-Za-z0-9]+/g, "ntn_***").replace(/secret_[A-Za-z0-9]+/g, "secret_***").slice(0, 200);
}

var ALLOWED_METHODS = ["GET", "POST", "PATCH"];
var ALLOWED_ENDPOINTS = /^\/(?:search|pages\/[a-f0-9\-]+|blocks\/[a-f0-9\-]+\/children)$/;

async function handleNotionRequest(req) {
  var method = req.method || "GET";
  if (ALLOWED_METHODS.indexOf(method) === -1) return { error: "Method not allowed: " + method };
  if (!req.endpoint || !ALLOWED_ENDPOINTS.test(req.endpoint)) return { error: "Endpoint not allowed" };

  var data = await chrome.storage.local.get(["notionToken"]);
  if (!data.notionToken) return { error: "Notion token not set. Open ferrid settings." };

  var token = data.notionToken.trim();
  if (!/^ntn_/.test(token)) return { error: "Invalid token format. Must start with ntn_" };

  var cacheKey = req.method + ":" + req.endpoint + ":" + JSON.stringify(req.body || {});
  if ((req.method === "GET" || req.endpoint === "/search") && cache.has(cacheKey)) {
    var c = cache.get(cacheKey);
    if (Date.now() - c.ts < CACHE_TTL) return c.data;
  }

  try {
    var res = await fetch("https://api.notion.com/v1" + req.endpoint, {
      method: req.method || "GET",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: req.body ? JSON.stringify(req.body) : undefined,
    });
    var json = await res.json();
    if (!res.ok) return { error: sanitizeError(json.message || JSON.stringify(json)) };
    if (req.method === "GET" || req.endpoint === "/search") cache.set(cacheKey, { data: json, ts: Date.now() });
    return json;
  } catch (e) {
    return { error: sanitizeError(e.message) };
  }
}
