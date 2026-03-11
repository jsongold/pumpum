# ferrid

Clip AI chat messages to Notion with one click. Chrome extensions for ChatGPT and Claude.

## Features

- One-click transfer of chat messages to Notion pages
- Markdown → Notion blocks conversion (headings, code, tables, lists, quotes)
- Page search with instant dropdown (3 candidates + "see more")
- Two transfer modes: Default (append) / Child Page (sub-page with link)
- Transparent glassmorphism UI
- Zero dependencies, vanilla JavaScript

## Installation (Developer)

```bash
git clone https://github.com/YOUR_USERNAME/ferrid.git
```

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extensions/chatgpt` or `extensions/claude`
4. Click ferrid icon in toolbar → enter Notion Integration Token → Save

## Notion Setup

1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations)
2. Click "+ New integration" → choose **Internal**
3. Name it `ferrid`, select workspace → Submit
4. Copy the "Internal integration secret" (`ntn_...`)
5. Open target Notion page → "..." → "Add Connections" → select `ferrid`

## Repository Structure

```
ferrid/
├── .github/workflows/
│   ├── ci.yml              # CI: validate + build on push/PR
│   ├── release.yml         # Create GitHub Release on tag
│   └── deploy-cws.yml      # Auto-deploy to Chrome Web Store
├── extensions/
│   ├── chatgpt/            # ferrid for ChatGPT
│   │   ├── manifest.json
│   │   ├── background.js
│   │   ├── content/
│   │   │   ├── app.js
│   │   │   └── styles.css
│   │   ├── popup/
│   │   │   ├── popup.html
│   │   │   └── popup.js
│   │   └── icons/
│   └── claude/             # ferrid for Claude
│       └── (same structure)
├── .gitignore
└── README.md
```

## Development

### Release a new version

```bash
# 1. Bump version in both manifest.json files (optional, CI does it from tag)
# 2. Commit and tag
git add .
git commit -m "v0.2.0"
git tag v0.2.0
git push origin main --tags
```

This triggers:
1. **CI** — validates manifests, checks for CSP violations and token leaks
2. **Release** — creates GitHub Release with downloadable ZIPs
3. **CWS Deploy** — uploads to Chrome Web Store (if configured)

### Chrome Web Store Setup (one-time)

To enable auto-deploy to Chrome Web Store:

#### 1. Register as a Chrome Developer

- Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- Pay the $5 one-time registration fee

#### 2. Create the extensions in CWS

- Upload each extension ZIP manually for the first time
- Note the **Extension ID** for each (shown in the dashboard URL)

#### 3. Get Google API credentials

Follow the [Chrome Web Store API guide](https://developer.chrome.com/docs/webstore/using-api/):

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Chrome Web Store API**
3. Create OAuth 2.0 credentials (Desktop app type)
4. Generate a refresh token using the OAuth Playground

#### 4. Add secrets to GitHub

Go to your repo → Settings → Secrets and variables → Actions:

**Secrets:**
| Name | Value |
|------|-------|
| `CWS_CLIENT_ID` | OAuth Client ID |
| `CWS_CLIENT_SECRET` | OAuth Client Secret |
| `CWS_REFRESH_TOKEN` | OAuth Refresh Token |

**Variables (Settings → Variables → Actions):**
| Name | Value |
|------|-------|
| `CWS_EXTENSION_ID_CHATGPT` | Extension ID for ChatGPT version |
| `CWS_EXTENSION_ID_CLAUDE` | Extension ID for Claude version |

## Security

- Tokens stored in `chrome.storage.local` (device-only, not synced)
- Token validation: must start with `ntn_`
- Error messages sanitized (tokens masked as `ntn_***`)
- No inline scripts (Manifest V3 CSP compliant)
- No external dependencies
- CI checks for accidentally committed tokens

## License

MIT
