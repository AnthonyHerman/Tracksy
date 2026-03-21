# WebKitGTK Rendering Workaround

## Problem

On this machine, WebKitGTK's DMA-BUF renderer fails with:

```
Failed to create GBM buffer of size 900x700: Invalid argument
```

This causes the Tauri WebView to render as a completely black window.

## Fix

Set the environment variable before launching the app:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 cargo tauri dev
```

## Scope

This is a machine-specific GPU/driver issue, not a Tauri or application bug. It affects development on systems where the GPU driver does not support the GBM buffer allocation path used by WebKitGTK's DMA-BUF renderer.

## Impact on CI/deployment

Production builds (AppImage, deb) may need this variable set in the launcher script if the target machine has the same driver limitation. Test on the target machine before shipping.
