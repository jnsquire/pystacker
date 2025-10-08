# Change Log

All notable changes to the "PyStacker" extension will be documented in this file.

## [0.1.0] - 2025-10-05

### Added
- Initial release
- Capture Python stack traces using bundled py-spy
- Terminal context menu integration for easy stack capture
- Automatic display of captured stack traces in read-only documents
- Cross-platform support (Windows, Linux, macOS)
- Send SIGUSR1 signal to Python processes (Unix only)
- **Optimized packaging:** Only py-spy executable bundled (~1.8 MB package size)
- **Platform-specific VSIX packages** with native py-spy binaries
- **cross-spawn integration** for reliable cross-platform process spawning

### Features
- Right-click on any terminal to capture its stack trace
- **Intelligent multi-process detection:** Finds all Python child processes recursively
- **Interactive process selection:** When multiple Python processes are detected, choose which to capture
- Command line display for easy process identification
- Automatic PID detection from terminal context
- Progress notifications during capture
- Output saved to extension storage with timestamp
 - JSON output is displayed in an interactive webview; text output opens in an editor
- Manual PID entry option via Command Palette
- **Configurable output format** (text or JSON)
- **Subprocess capture** option for multi-process Python applications
- **Local variable display** option for detailed debugging
- JSON syntax highlighting for formatted output
