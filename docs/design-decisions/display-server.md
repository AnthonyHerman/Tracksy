# Display Server

Confirmed: XDG_SESSION_TYPE=x11

This machine runs KDE Plasma on X11. Tray implementation uses the XEmbed protocol
via Tauri's built-in tray API. No special Wayland/SNI workarounds are required.

tauri-plugin-positioner window restoration works as expected on X11.
