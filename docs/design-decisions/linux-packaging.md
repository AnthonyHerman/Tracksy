# Linux Packaging

## Decision

Use Tauri's built-in `cargo tauri build` to produce AppImage and deb packages for Linux.

## Bundle targets

- **deb** (4.8 MB) — for Debian/Ubuntu-based systems. Depends on system WebKitGTK.
- **AppImage** (94 MB) — portable, single-file. Bundles all shared libraries.

## Build command

```bash
NO_STRIP=true npx @tauri-apps/cli build
```

`NO_STRIP=true` is required because linuxdeploy's bundled `strip` tool cannot handle `.relr.dyn` sections in libraries on newer distros (Arch Linux 2026). Without it, the AppImage build fails on `libSvtAv1Enc.so.4`.

## Dev convenience scripts

- `npm run tauri:dev` — launches with `WEBKIT_DISABLE_DMABUF_RENDERER=1` for machines with GPU rendering issues
- `npm run tauri:build` — production build

## WEBKIT_DISABLE_DMABUF_RENDERER

Users on systems where WebKitGTK's DMA-BUF renderer fails (see `webkitgtk-rendering.md`) need to set `WEBKIT_DISABLE_DMABUF_RENDERER=1` before launching the installed app.

## Rollback

No rollback needed — packaging is additive and doesn't change runtime behavior.
