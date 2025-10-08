# Building Platform-Specific VSIX Packages

PyStacker includes platform-specific binaries (py-spy executables) that must be packaged separately for each platform.

## Why Platform-Specific Packages?

This extension bundles only the native `py-spy` executable:
- `py-spy.exe` (Windows)
- `py-spy` binary (Linux/macOS)

This keeps the package size small (~1.8 MB) while ensuring users get the correct binary for their system.

## Package Sizes

- Windows: ~1.8 MB
- Linux: ~1.8 MB  
- macOS: ~1.8 MB

## Building Packages

### Prerequisites

1. **For Windows builds:** Build on Windows with Python 3.7+ installed
2. **For Linux builds:** Build on Linux with Python 3.7+ installed
3. **For macOS builds:** Build on macOS with Python 3.7+ installed

### Build Commands

```bash
# Build for current platform only
npm run package

# Build Windows x64 package (run on Windows)
npm run package:win32

# Build Linux x64 package (run on Linux)
npm run package:linux

# Build macOS packages (run on macOS)
npm run package:darwin

# Build all platforms (requires running on each platform)
npm run package:all
```

## Output Files

Platform-specific VSIX files will be created:

- `pystacker-win32-x64-0.1.0.vsix` - Windows 64-bit
- `pystacker-linux-x64-0.1.0.vsix` - Linux 64-bit
- `pystacker-darwin-x64-0.1.0.vsix` - macOS Intel
- `pystacker-darwin-arm64-0.1.0.vsix` - macOS Apple Silicon

## Build Process

### On Windows

```powershell
# Clean previous builds
Remove-Item .venv -Recurse -Force -ErrorAction SilentlyContinue

# Install dependencies and create venv with py-spy
npm install

# Compile TypeScript
npm run compile

# Package for Windows
npm run package:win32
```

### On Linux

```bash
# Clean previous builds
rm -rf .venv

# Install dependencies and create venv with py-spy
npm install

# Compile TypeScript
npm run compile

# Package for Linux
npm run package:linux
```

### On macOS

```bash
# Clean previous builds
rm -rf .venv

# Install dependencies and create venv with py-spy
npm install

# Compile TypeScript
npm run compile

# Package for macOS (both Intel and ARM)
npm run package:darwin
```

## Installing Platform-Specific Packages

### From Command Line

```bash
# Windows
code --install-extension pystacker-win32-x64-0.1.0.vsix

# Linux
code --install-extension pystacker-linux-x64-0.1.0.vsix

# macOS Intel
code --install-extension pystacker-darwin-x64-0.1.0.vsix

# macOS Apple Silicon
code --install-extension pystacker-darwin-arm64-0.1.0.vsix
```

### From VS Code UI

1. Extensions view → "..." menu → "Install from VSIX..."
2. Select the appropriate platform-specific VSIX file

## Publishing to Marketplace

When publishing to the VS Code Marketplace, publish all platform-specific packages:

```bash
# Publish all platforms (requires building on each platform first)
vsce publish --target win32-x64
vsce publish --target linux-x64
vsce publish --target darwin-x64
vsce publish --target darwin-arm64
```

VS Code will automatically serve the correct platform-specific package to users based on their system.

## CI/CD Considerations

For automated builds, you'll need:

1. **Multiple runners:** Windows, Linux, and macOS build agents
2. **Matrix builds:** Configure CI to build on each platform
3. **Artifact collection:** Gather all platform-specific VSIX files
4. **Publishing:** Deploy all platform packages together

### Example GitHub Actions Matrix

```yaml
strategy:
  matrix:
    include:
      - os: windows-latest
        target: win32-x64
      - os: ubuntu-latest
        target: linux-x64
      - os: macos-latest
        target: darwin-x64 darwin-arm64
```

## Verification

To verify your platform-specific package:

1. Install the VSIX on the target platform
2. Open a terminal in VS Code
3. Right-click the terminal and run the PyStacker capture command (or use the Command Palette)
4. Verify py-spy executes and the stack trace appears (JSON results open in the webview or text opens in an editor)

## Notes

- Each platform package is ~6-10 MB (includes Python runtime + py-spy)
- The `.venv` directory must be rebuilt on each platform
- Python version should be consistent across platforms (currently 3.13)
- Cross-compilation is not supported (must build on native platform)

### Notes about the build

- The extension uses `esbuild` to bundle both the extension code and the webview UI. Run `npm run build` (or the platform-specific packaging scripts) to produce the `out/` artifacts and VSIX files.
