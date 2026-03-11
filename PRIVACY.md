# Privacy Policy — ferrid

**Last updated:** 2026-03-10

## Overview

ferrid is a browser extension that transfers AI chat messages to your Notion workspace. We take your privacy seriously.

## Data Collection

ferrid does **NOT** collect, store, or transmit any personal data to our servers. We have no servers.

### What ferrid accesses

| Data | Purpose | Stored where |
|------|---------|-------------|
| Chat messages on ChatGPT/Claude | Displayed in sidebar for selection | In-memory only (never saved) |
| Notion API token | Authenticates with your Notion workspace | `chrome.storage.local` (your device only) |
| Notion page list | Lets you choose a transfer destination | In-memory cache (1 min TTL) |

### What ferrid does NOT do

- Does not send data to any server other than `api.notion.com`
- Does not track usage or analytics
- Does not use cookies
- Does not access browsing history
- Does not read any pages other than ChatGPT and Claude
- Does not sync data across devices (uses `storage.local`, not `storage.sync`)

## Third-party Services

ferrid communicates only with the [Notion API](https://developers.notion.com/) using your self-provided integration token. Notion's privacy policy applies to data stored in your Notion workspace.

## Data Security

- Your Notion token is stored locally on your device only
- Token is validated (must start with `ntn_`)
- Error messages are sanitized to prevent token exposure
- All communication with Notion uses HTTPS

## Changes

We may update this policy. Changes will be posted in this file and reflected in the extension's Chrome Web Store listing.

## Contact

For questions, open an issue on [GitHub](https://github.com/YOUR_USERNAME/ferrid/issues).
