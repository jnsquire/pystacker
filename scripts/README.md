# PyStacker Test Scripts

This directory contains sample scripts for testing the PyStacker extension.

## Files

### `sample.py`
A multi-threaded Python program that:
- Runs 3 worker threads simultaneously
- Each thread computes Fibonacci numbers recursively
- Runs for approximately 50 seconds
- Prints progress information to help you see when threads are active
- Perfect for testing stack trace capture!

**Features:**
- Multiple threads make for interesting stack traces
- Recursive function calls create deep call stacks
- Sleep intervals make it easy to capture at any time
- Can be interrupted with Ctrl+C

### Launcher Scripts

Three launcher scripts are provided for different platforms:

#### Windows PowerShell: `run-sample.ps1`
```powershell
./scripts/run-sample.ps1
```

#### Windows CMD: `run-sample.bat`
```cmd
scripts\run-sample.bat
```

#### Linux/macOS Bash: `run-sample.sh`
```bash
./scripts/run-sample.sh
```

All launchers:
- Check for Python installation
- Verify the sample.py file exists
- Display helpful instructions
- Launch Python directly (not through a shell wrapper)

## How to Test PyStacker

1. **Launch the sample program:**
   ```powershell
   # In VS Code terminal
   ./scripts/run-sample.ps1
   ```

2. **Capture the stack trace (choose one method):**
   - **Right-click:** Right-click on the terminal and select the PyStacker capture command
   - **Command Palette:** Run the PyStacker capture command for the active terminal

3. **What you'll see:**
   - The extension will detect the Python worker processes
   - You can choose to capture a single process or "Capture All Python Processes"
   - JSON output will open in the interactive webview (collapsible threads and frames). Text output will open in an editor window.

4. **Try different configurations:**
   - Enable JSON output: Settings → PyStacker → Output Format → json
   - Show local variables: Settings → PyStacker → Show Local Variables → ✓
   - Include subprocesses: Settings → PyStacker → Include Subprocesses → ✓

## Example Output

```
Thread 0x1234 (active): "Thread-1"
    fibonacci (sample.py:14)
    fibonacci (sample.py:16)
    fibonacci (sample.py:16)
    fibonacci (sample.py:16)
    worker_thread (sample.py:25)
    ...
```

## Notes

- The sample program is designed to be CPU-friendly (mostly sleeping)
- Each thread computes fib(20) which creates a call depth of ~20 frames
- The program will run for about 50 seconds then exit automatically
- You can stop it early with Ctrl+C
