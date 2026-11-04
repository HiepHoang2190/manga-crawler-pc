# Electron main process

Entry: `main.js` (window lifecycle, `app.whenReady`). Renderer APIs are exposed in `preload.js` as `window.electronAPI`.

## `ipc/`

Product IPC handlers in one file per area: window, settings, library, reader, download, export, plugins, auth, kindle, cookies, tools. `ipc/index.js` exports `registerAllIpc`; `main.js` calls `registerAllIpc(createIpcContext())`.

Do not add `ipcMain.handle` / `ipcMain.on` in `main.js`.

## `lib/`

Backend used by IPC.

| Folder | Role |
|--------|------|
| `base/` | Connector base classes (`BaseConnectorService`, HTML/API subclasses) |
| `connectors/` | Site registry (`index.js`) and per-site wrappers |
| `services/` | Site download / fetch implementations |
| `api-clients/` | External HTTP / auth clients |
| `loaders/` | Open CBZ, PDF, EPUB, MOBI, RAR, ZIP for the reader. MOBI/AZW uses `kindleunpack_wrapper.py` (Python 3 on macOS/Linux; `kindleunpack.exe` on Windows) |
| `plugins/` | JS plugin runtime |
| `workers/` | Worker threads (e.g. PDF render) |
| `utils/` | Shared helpers grouped by category (`archive/`, `connector/`, `local-library/`, `ebook/`, `image/`, `storage/`, `core/`, `rename/`, `cache/`) |
| `__tests__/` | Jest tests for this backend (some tests are co-located next to source) |

Plus `browserRenderer.js` at `lib/` root (hidden BrowserWindow fetch). Import utils from a category (`require('./lib/utils/archive')`). `utils/index.js` is a compatibility barrel, not a complete catalog.

## Tests

- `npm test` — unit tests (skips `*.live.test.js`)
- `npm run test:connectors` — live connector tests (`jest.live.config.js`)

Folders, `index.js`, and test filenames are the source of truth. Do not add per-folder README inventories.
