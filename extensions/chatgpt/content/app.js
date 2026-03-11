// pumpum for ChatGPT — app.js v0.2
(function() {
  "use strict";
  if (document.getElementById("chatclip-panel")) return;

  var SITE = "ChatGPT";
  var PREVIEW = 28;
  var INIT_SHOW = 3;

  // ===== PARSER (ChatGPT) =====
  function parseMessages() {
    var turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    var messages = [];
    turns.forEach(function(turn, idx) {
      var roleEl = turn.querySelector('[data-message-author-role="user"]') ||
        turn.querySelector('[data-message-author-role="assistant"]');
      if (!roleEl) return;
      var role = roleEl.getAttribute("data-message-author-role") || "unknown";
      var contentEl = turn.querySelector(".markdown, .whitespace-pre-wrap, .text-message");
      if (!contentEl) return;
      var text = contentEl.innerText || "";
      if (!text.trim()) return;
      messages.push({ id: "msg-" + idx, role: role === "user" ? "user" : "assistant", text: text.trim(), element: turn, contentEl: contentEl });
    });
    return messages;
  }
  function getObserveTarget() { return document.querySelector("main") || document.body; }

  // ===== SAFE MESSAGING (graceful when background unavailable) =====
  function safeSend(msg) {
    return new Promise(function(resolve) {
      try {
        chrome.runtime.sendMessage(msg, function(res) {
          if (chrome.runtime.lastError) { resolve({ error: "Extension error" }); return; }
          resolve(res || { error: "No response" });
        });
      } catch (e) { resolve({ error: "Extension unavailable" }); }
    });
  }

  // ===== NOTION API =====
  function notionApi(method, endpoint, body) {
    return safeSend({ type: "NOTION_API", method: method, endpoint: endpoint, body: body });
  }
  function searchPages(query) {
    var body = { filter: { property: "object", value: "page" } };
    if (query) body.query = query;
    return notionApi("POST", "/search", body).then(function(res) {
      if (res.error) return [];
      return (res.results || []).map(function(p) { return { id: p.id, title: extractTitle(p), icon: extractIcon(p) }; });
    }).catch(function() { return []; });
  }
  function extractTitle(page) {
    var props = page.properties || {};
    var keys = Object.keys(props);
    for (var i = 0; i < keys.length; i++) {
      var prop = props[keys[i]];
      if (prop.type === "title" && prop.title && prop.title.length > 0) return prop.title.map(function(t) { return t.plain_text; }).join("");
    }
    return "Untitled";
  }
  function extractIcon(page) { if (!page.icon) return ""; if (page.icon.type === "emoji") return page.icon.emoji; return ""; }
  function appendBlocks(pageId, blocks) {
    var chunks = [];
    for (var i = 0; i < blocks.length; i += 100) chunks.push(blocks.slice(i, i + 100));
    return chunks.reduce(function(p, chunk) {
      return p.then(function(prev) { if (prev && prev.error) return prev; return notionApi("PATCH", "/blocks/" + pageId + "/children", { children: chunk }); });
    }, Promise.resolve({ ok: true }));
  }
  function createChildPage(parentId, title) {
    return notionApi("POST", "/pages", { parent: { type: "page_id", page_id: parentId }, properties: { title: [{ text: { content: title } }] } });
  }

  // ===== MARKDOWN CONVERSION =====
  function rt(c) { return { type: "text", text: { content: c } }; }
  function tb(type, text) { var b = { object: "block", type: type }; b[type] = { rich_text: ip(text) }; return b; }
  function ip(text) {
    var segs = [], re = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\*(.+?)\*)|(\[(.+?)\]\((.+?)\))/g, last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) segs.push(rt(text.slice(last, m.index)));
      if (m[1]) segs.push({ type: "text", text: { content: m[2] }, annotations: { bold: true } });
      else if (m[3]) segs.push({ type: "text", text: { content: m[4] }, annotations: { code: true } });
      else if (m[5]) segs.push({ type: "text", text: { content: m[6] }, annotations: { italic: true } });
      else if (m[7]) segs.push({ type: "text", text: { content: m[8], link: { url: m[9] } } });
      last = m.index + m[0].length;
    }
    if (last < text.length) segs.push(rt(text.slice(last)));
    return segs.length > 0 ? segs : [rt(text)];
  }
  function isTableRow(line) { return /^\|(.+)\|$/.test(line.trim()); }
  function isSeparatorRow(line) { return /^\|[\s\-:|]+\|$/.test(line.trim()); }
  function parseTableCells(line) { return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function(c) { return c.trim(); }); }
  function buildTableBlock(rows) {
    if (rows.length === 0) return null;
    var width = rows[0].length;
    return {
      object: "block", type: "table",
      table: { table_width: width, has_column_header: true, has_row_header: false,
        children: rows.map(function(row) {
          var cells = []; for (var i = 0; i < width; i++) cells.push(ip(row[i] || ""));
          return { object: "block", type: "table_row", table_row: { cells: cells } };
        })
      }
    };
  }
  function mdToBlocks(md) {
    var lines = md.split("\n"), blocks = [], inCode = false, codeLines = [], codeLang = "", tableRows = [];
    function flushTable() { if (tableRows.length > 0) { var t = buildTableBlock(tableRows); if (t) blocks.push(t); tableRows = []; } }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf("``" + "`") === 0) { flushTable(); if (!inCode) { inCode = true; codeLang = line.slice(3).trim() || "plain text"; codeLines = []; } else { blocks.push({ object: "block", type: "code", code: { rich_text: [rt(codeLines.join("\n"))], language: codeLang } }); inCode = false; } continue; }
      if (inCode) { codeLines.push(line); continue; }
      if (isTableRow(line)) { if (isSeparatorRow(line)) continue; tableRows.push(parseTableCells(line)); continue; } else { flushTable(); }
      if (line.indexOf("### ") === 0) { blocks.push(tb("heading_3", line.slice(4))); continue; }
      if (line.indexOf("## ") === 0) { blocks.push(tb("heading_2", line.slice(3))); continue; }
      if (line.indexOf("# ") === 0) { blocks.push(tb("heading_1", line.slice(2))); continue; }
      if (/^[-*]\s/.test(line)) { blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: ip(line.replace(/^[-*]\s/, "")) } }); continue; }
      if (/^\d+\.\s/.test(line)) { blocks.push({ object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: ip(line.replace(/^\d+\.\s/, "")) } }); continue; }
      if (/^---+$/.test(line.trim())) { blocks.push({ object: "block", type: "divider", divider: {} }); continue; }
      if (line.indexOf("> ") === 0) { blocks.push({ object: "block", type: "quote", quote: { rich_text: ip(line.slice(2)) } }); continue; }
      if (!line.trim()) continue;
      blocks.push(tb("paragraph", line));
    }
    flushTable();
    if (inCode && codeLines.length) blocks.push({ object: "block", type: "code", code: { rich_text: [rt(codeLines.join("\n"))], language: codeLang } });
    return blocks.length > 0 ? blocks : [tb("paragraph", "(empty)")];
  }
  function h2m(el) {
    var md = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) { md += node.textContent; continue; }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      var tag = node.tagName.toLowerCase();
      if (tag === "p") md += h2m(node) + "\n\n";
      else if (tag === "h1") md += "# " + node.textContent + "\n\n";
      else if (tag === "h2") md += "## " + node.textContent + "\n\n";
      else if (tag === "h3") md += "### " + node.textContent + "\n\n";
      else if (tag === "strong" || tag === "b") md += "**" + node.textContent + "**";
      else if (tag === "em" || tag === "i") md += "*" + node.textContent + "*";
      else if (tag === "code") { if (!node.parentElement || node.parentElement.tagName.toLowerCase() !== "pre") md += "`" + node.textContent + "`"; }
      else if (tag === "pre") { var c = node.querySelector("code"); var lc = c ? Array.from(c.classList).find(function(x) { return x.indexOf("language-") === 0; }) : null; md += "``" + "`" + (lc ? lc.replace("language-", "") : "") + "\n" + (c || node).textContent + "\n``" + "`\n\n"; }
      else if (tag === "ul") { Array.from(node.children).forEach(function(li) { if (li.tagName.toLowerCase() === "li") md += "- " + h2m(li).trim() + "\n"; }); md += "\n"; }
      else if (tag === "ol") { var n = 1; Array.from(node.children).forEach(function(li) { if (li.tagName.toLowerCase() === "li") { md += n + ". " + h2m(li).trim() + "\n"; n++; } }); md += "\n"; }
      else if (tag === "a") md += "[" + node.textContent + "](" + node.href + ")";
      else if (tag === "blockquote") md += node.textContent.split("\n").map(function(l) { return "> " + l; }).join("\n") + "\n\n";
      else if (tag === "hr") md += "---\n\n";
      else if (tag === "br") md += "\n";
      else if (tag === "table") { node.querySelectorAll("tr").forEach(function(row, ri) { var cells = row.querySelectorAll("th, td"); md += "| " + Array.from(cells).map(function(c) { return c.textContent.trim(); }).join(" | ") + " |\n"; if (ri === 0) md += "| " + Array.from(cells).map(function() { return "---"; }).join(" | ") + " |\n"; }); md += "\n"; }
      else md += h2m(node);
    }
    return md;
  }
  function getMd(msg) { if (!msg.contentEl) return msg.text; return h2m(msg.contentEl); }
  function getSettings() { return safeSend({ type: "GET_SETTINGS" }).catch(function() { return {}; }); }
  function saveSettings(p) { return safeSend({ type: "SAVE_SETTINGS", payload: p }).catch(function() {}); }
  function timeStr() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0") + " " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); }

  // ===== STATE =====
  var S = { open: true, messages: [], pageId: null, pageTitle: null, pages: [], expanded: false, debTimer: null, lastHash: "", transferMode: "default", apiReady: false };

  // ===== UI =====
  function mount() {
    var toggle = document.createElement("div"); toggle.id = "cc-toggle"; toggle.className = "cc-open";
    toggle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>';
    toggle.addEventListener("click", togglePanel); document.body.appendChild(toggle);
    var panel = document.createElement("div"); panel.id = "chatclip-panel";
    panel.innerHTML = '<div class="cc-hdr"><span class="cc-hdr__name">pumpum</span><span class="cc-hdr__tag">' + SITE + '</span></div>' +
      '<div class="cc-psel"><button class="cc-btn" id="cc-prev" title="Previous"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<div class="cc-psel__wrap"><input class="cc-psel__input" id="cc-search" placeholder="Search Notion page\u2026" autocomplete="off"/><div class="cc-dropdown" id="cc-dropdown"></div></div>' +
      '<button class="cc-btn" id="cc-next" title="Next / Root"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></button>' +
      '<button class="cc-btn" id="cc-new" title="New page"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg></button></div>' +
      '<div class="cc-page"><span class="cc-page__dot" id="cc-dot"></span><span class="cc-page__label" id="cc-label">No page selected</span></div>' +
      '<div class="cc-msgs" id="cc-msgs"></div>' +
      '<div class="cc-foot" id="cc-foot">' + SITE + ' \u00b7 0 msgs</div>';
    document.body.appendChild(panel);
    var toast = document.createElement("div"); toast.id = "cc-toast"; document.body.appendChild(toast);
    bindEvents();
  }

  function togglePanel() {
    S.open = !S.open; var p = document.getElementById("chatclip-panel"), t = document.getElementById("cc-toggle");
    if (S.open) { p.classList.remove("cc-hidden"); t.classList.add("cc-open"); t.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>'; }
    else { p.classList.add("cc-hidden"); t.classList.remove("cc-open"); t.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>'; }
  }

  function bindEvents() {
    var input = document.getElementById("cc-search");
    input.addEventListener("input", function() { clearTimeout(S.debTimer); S.debTimer = setTimeout(function() { doSearch(input.value); }, 250); });
    input.addEventListener("focus", function() { S.expanded = false; if (S.pages.length > 0) renderDropdown(); else doSearch(""); });
    document.addEventListener("click", function(e) { if (!e.target.closest(".cc-psel")) hideDropdown(); });
    document.getElementById("cc-prev").addEventListener("click", function() { navPage(-1); });
    document.getElementById("cc-next").addEventListener("click", function() { var inp = document.getElementById("cc-search"); if (!inp.value.trim() && S.pages.length > 0) selectPage(S.pages[0]); else navPage(1); });
    document.getElementById("cc-new").addEventListener("click", handleNew);
  }

  function doSearch(q) { return searchPages(q).then(function(r) { S.pages = r; S.expanded = false; renderDropdown(); }); }
  function renderDropdown() {
    var dd = document.getElementById("cc-dropdown");
    if (S.pages.length === 0) { dd.innerHTML = '<div class="cc-dd__empty">' + (S.apiReady ? "No pages found" : "API not connected") + '</div>'; dd.classList.add("cc-vis"); return; }
    var show = S.expanded ? S.pages : S.pages.slice(0, INIT_SHOW), html = "";
    for (var i = 0; i < show.length; i++) { var p = show[i]; html += '<div class="cc-dd__item" data-idx="' + i + '">' + (p.icon ? '<span class="cc-dd__icon">' + esc(p.icon) + '</span>' : '') + '<span class="cc-dd__text">' + esc(p.title) + '</span></div>'; }
    if (!S.expanded && S.pages.length > INIT_SHOW) html += '<div class="cc-dd__more" id="cc-more">see more\u2026 (' + (S.pages.length - INIT_SHOW) + ')</div>';
    dd.innerHTML = html; dd.classList.add("cc-vis");
    dd.querySelectorAll(".cc-dd__item").forEach(function(el) { el.addEventListener("click", function() { var idx = parseInt(el.dataset.idx); var list = S.expanded ? S.pages : S.pages.slice(0, INIT_SHOW); if (list[idx]) { selectPage(list[idx]); hideDropdown(); } }); });
    var more = document.getElementById("cc-more"); if (more) more.addEventListener("click", function() { S.expanded = true; renderDropdown(); });
  }
  function hideDropdown() { var dd = document.getElementById("cc-dropdown"); if (dd) dd.classList.remove("cc-vis"); }
  function selectPage(pg) { S.pageId = pg.id; S.pageTitle = pg.title; document.getElementById("cc-search").value = pg.title; saveSettings({ notionPageId: pg.id, notionPageTitle: pg.title }); updatePageInfo(); showToast("\u2192 " + (pg.icon || "") + " " + pg.title); }
  function navPage(dir) { if (S.pages.length === 0) return; var idx = -1; for (var i = 0; i < S.pages.length; i++) { if (S.pages[i].id === S.pageId) { idx = i; break; } } var next = idx + dir; if (next < 0) next = S.pages.length - 1; if (next >= S.pages.length) next = 0; selectPage(S.pages[next]); }
  function handleNew() { var title = prompt("New page title:"); if (!title) return; if (!S.pageId) { showToast("Select a parent page first", true); return; } createChildPage(S.pageId, title).then(function(res) { if (res.error) { showToast("Error: " + res.error, true); return; } selectPage({ id: res.id, title: title, icon: "" }); showToast("Created: " + title); }); }

  function renderMessages() {
    var newMsgs = parseMessages();
    var hash = newMsgs.map(function(m) { return m.id + m.text.slice(0, 20); }).join("|");
    if (hash === S.lastHash) return; S.lastHash = hash; S.messages = newMsgs;
    var container = document.getElementById("cc-msgs"); if (!container) return;
    var html = "";
    for (var i = 0; i < newMsgs.length; i++) { var m = newMsgs[i]; html += '<div class="cc-m"><span class="cc-m__r cc-m__r--' + m.role + '">' + (m.role === "user" ? "U" : "A") + '</span><span class="cc-m__t" data-id="' + m.id + '">' + esc(m.text.slice(0, PREVIEW)) + (m.text.length > PREVIEW ? "\u2026" : "") + '</span><button class="cc-m__s" data-id="' + m.id + '" title="Send to Notion"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></div>'; }
    container.innerHTML = html;
    container.querySelectorAll(".cc-m__t").forEach(function(el) { el.addEventListener("click", function() { var msg = null; for (var j = 0; j < S.messages.length; j++) { if (S.messages[j].id === el.dataset.id) { msg = S.messages[j]; break; } } if (msg && msg.element) msg.element.scrollIntoView({ behavior: "smooth", block: "center" }); }); });
    container.querySelectorAll(".cc-m__s").forEach(function(el) { el.addEventListener("click", function() { handleSend(el.dataset.id, el); }); });
    var foot = document.getElementById("cc-foot"); if (foot) foot.textContent = SITE + " \u00b7 " + S.messages.length + " msgs";
  }
  function updatePageInfo() { var d = document.getElementById("cc-dot"), l = document.getElementById("cc-label"); if (S.pageId) { d.classList.add("cc-on"); l.textContent = S.pageTitle || "Connected"; } else { d.classList.remove("cc-on"); l.textContent = "No page selected"; } }

  // ===== TRANSFER =====
  function handleSend(msgId, btn) {
    if (!S.pageId) { showToast("Select a page first", true); return; }
    var msg = null; for (var i = 0; i < S.messages.length; i++) { if (S.messages[i].id === msgId) { msg = S.messages[i]; break; } } if (!msg) return;
    btn.classList.add("cc-sending");
    var md = getMd(msg);
    var roleName = msg.role === "user" ? "\ud83d\udc64 User" : "\ud83e\udd16 Assistant";
    var title = msg.text.slice(0, 50) + (msg.text.length > 50 ? "\u2026" : "");
    var time = timeStr();
    var done = function(res) {
      btn.classList.remove("cc-sending");
      if (res && res.error) { btn.classList.add("cc-err"); showToast("Error: " + res.error, true); setTimeout(function() { btn.classList.remove("cc-err"); }, 3000); }
      else { btn.classList.add("cc-ok"); showToast("Sent \u2713"); }
    };
    if (S.transferMode === "childpage") {
      var pageTitle = roleName + " " + title;
      createChildPage(S.pageId, pageTitle).then(function(res) {
        if (res.error) { done(res); return; }
        var childId = res.id;
        appendBlocks(childId, mdToBlocks(md)).then(function(res2) {
          if (res2 && res2.error) { done(res2); return; }
          var linkBlock = { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: title + " " } }, { type: "mention", mention: { type: "page", page: { id: childId } } }, { type: "text", text: { content: " \u00b7 " + time }, annotations: { italic: true, color: "gray" } }] } };
          appendBlocks(S.pageId, [linkBlock, { object: "block", type: "divider", divider: {} }]).then(done);
        });
      });
    } else {
      var headerBlocks = [tb("heading_3", title), { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: roleName + " \u00b7 " + time }, annotations: { italic: true, color: "gray" } }] } }, { object: "block", type: "divider", divider: {} }];
      appendBlocks(S.pageId, headerBlocks.concat(mdToBlocks(md)).concat([{ object: "block", type: "divider", divider: {} }])).then(done);
    }
  }

  function showToast(msg, isErr) { var el = document.getElementById("cc-toast"); el.textContent = msg; el.className = "cc-toast-vis " + (isErr ? "cc-toast-err" : "cc-toast-ok"); setTimeout(function() { el.className = ""; }, 2200); }
  function esc(s) { var d = document.createElement("span"); d.textContent = s; return d.innerHTML; }

  // ===== INIT =====
  function init() {
    mount();
    // Render messages immediately (works without API)
    renderMessages();
    // MutationObserver for new messages
    var mt = null;
    try {
      new MutationObserver(function() { if (mt) return; mt = setTimeout(function() { mt = null; renderMessages(); }, 600); }).observe(getObserveTarget(), { childList: true, subtree: true });
    } catch (e) { /* observer failed, fall back to polling */ setInterval(renderMessages, 2000); }

    // Load settings and API (non-blocking)
    getSettings().then(function(s) {
      if (s && s.notionPageId) { S.pageId = s.notionPageId; S.pageTitle = s.notionPageTitle || "Saved page"; document.getElementById("cc-search").value = S.pageTitle; updatePageInfo(); }
      if (s && s.transferMode) S.transferMode = s.transferMode;
    });
    searchPages("").then(function(p) { if (p.length > 0) S.apiReady = true; S.pages = p; });
    setInterval(function() { getSettings().then(function(s) { if (s && s.transferMode) S.transferMode = s.transferMode; }); }, 5000);
  }

  if (document.readyState === "complete") setTimeout(init, 800);
  else window.addEventListener("load", function() { setTimeout(init, 800); });
})();
