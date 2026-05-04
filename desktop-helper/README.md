# Desktop Helper

The Capture One / Smart Shooter tether bridge. Built later in v0.1.

## What it does
A small Python system-tray app the photographer runs during a shoot. It:
1. Authenticates with the HeadshotDesk API.
2. Pulls the participant queue for the active job.
3. On click of a participant, copies their name to the system clipboard.
4. Capture One / Smart Shooter pick up the clipboard via their "Clipboard Contents"
   rename token, automatically renaming every shot fired.
5. Watches the export folder for finished JPEGs and uploads them to HeadshotDesk.

## Build target
- macOS (universal binary)
- Windows 10+

Packaged with PyInstaller. Auto-update via a small JSON manifest.

## Status
Not started. Will be built once the backend job + participant APIs are stable.
