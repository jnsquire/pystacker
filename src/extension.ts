import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as spawn from 'cross-spawn';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ThreadDump } from './shared/types.js';


export function deactivate() {}

function getBundledPySpyPath(context: vscode.ExtensionContext): string {
    const binDir = path.join(context.extensionPath, 'bin');
    const pyspyExe = process.platform === 'win32'
        ? path.join(binDir, 'py-spy.exe')
        : path.join(binDir, 'py-spy');
    
    if (!fs.existsSync(pyspyExe)) {
        throw new Error(`Bundled py-spy not found at ${pyspyExe}. Please reinstall the extension.`);
    }
    
    return pyspyExe;
}

function getOrCreateTerminal(name: string): vscode.Terminal {
    const existing = vscode.window.terminals.find((t: any) => t.name === name);
    if (existing) return existing;
    return vscode.window.createTerminal(name);
}

class StackTraceWebviewProvider {
    private panelsByPid: Map<number, vscode.WebviewPanel> = new Map();
    private dataByPid: Map<number, { threads?: ThreadDump[]; processInfo?: { pid: number; name: string; }; }> = new Map();
    private output: vscode.OutputChannel | undefined;

    constructor(private context: vscode.ExtensionContext) {
    }

    private getOutputChannel() {
        return (this.output ??= vscode.window.createOutputChannel('PyStacker'));
    }

    // Public logging helper so callers outside the class can write to the same output channel
    public log(message: string) {
        this.getOutputChannel().appendLine(message);
    }

    // Post an error message to the webview for a given pid, if present.
    // Falls back to showing a notification if no panel is open for the pid.
    public postErrorToPanel(pid: number, message: string) {
        const panel = this.panelsByPid.get(pid);
        if (panel) {
            try {
                panel.webview.postMessage({ command: 'error', message });
                this.getOutputChannel().appendLine(`posted error to pid=${pid}: ${message}`);
                return;
            } catch (e) {
                // ignore and fall through to notification
            }
        }
        vscode.window.showErrorMessage(message);
    }

    public show(context: vscode.ExtensionContext, stackData: ThreadDump[], processInfo: { pid: number; name: string; }) {
        const output = this.getOutputChannel();
        const pid = processInfo.pid;
        output.appendLine(`show(): pid=${pid} name=${processInfo.name} threads=${(stackData || []).length}`);

        this.dataByPid.set(pid, { threads: stackData, processInfo });
        // Persist last-seen stack for this pid into workspaceState so we can restore after reloads
        try {
            const key = `pystacker.latest.${pid}`;
            context.workspaceState.update(key, { threads: stackData, processInfo });
            output.appendLine(`show(): persisted state to workspaceState key=${key}`);
        } catch (e) {
            output.appendLine(`show(): failed to persist state for pid=${pid}: ${String(e)}`);
        }

        const column = vscode.ViewColumn.Beside;

        // Reuse existing panel for this pid if present
        let panel = this.panelsByPid.get(pid);
        if (panel) {
            panel.reveal(column);
            // Send the new data directly to the live webview instead of reloading HTML.
            // This avoids timing issues where the webview reload may not post 'ready' quickly enough.
            output.appendLine(`Updating existing panel for pid=${pid} (threads=${(stackData||[]).length})`);
            try {
                panel.webview.postMessage({ command: 'init', threads: stackData || [], processInfo });
                output.appendLine(`posted init to existing panel pid=${pid}`);
            } catch (e) {
                output.appendLine(`failed to post init to existing panel pid=${pid}: ${String(e)}`);
            }
            return;
        }

        panel = vscode.window.createWebviewPanel(
            'pystacker.stack',
            `Stack Trace: ${processInfo.name} (PID: ${pid})`,
            column,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out')]
            }
        );

        panel.webview.html = this.getWebviewContent(panel.webview, context.extensionUri);

        panel.webview.onDidReceiveMessage(message => {
            if (!message || !message.command) return;
            try { this.getOutputChannel().appendLine(`webview message: ${JSON.stringify(message)}`); } catch { }

            if (message.command === 'ready') {
                const data = this.dataByPid.get(pid) || { threads: [], processInfo: { pid, name: processInfo.name } };
                try {
                    panel?.webview.postMessage({ command: 'init', threads: data.threads || [], processInfo: data.processInfo }); 
                    output.appendLine(`posted init to pid=${pid}`); 
                } catch (e) { 
                    output.appendLine(`failed to post init to pid=${pid}: ${String(e)}`); 
                }
            } else if (message.command === 'refresh') {
                // forward to extension command to perform capture
                vscode.commands.executeCommand('pystacker.refresh', message.pid, message.name);
            }
        }, null, context.subscriptions);

        panel.onDidDispose(() => {
            this.panelsByPid.delete(pid);
            this.dataByPid.delete(pid);
            output.appendLine(`disposed panel pid=${pid}`);
            // Remove persisted state on dispose
            context.workspaceState.update(`pystacker.latest.${pid}`, undefined);
            output.appendLine(`removed persisted state for pid=${pid}`);
        }, null, context.subscriptions);

        this.panelsByPid.set(pid, panel);
    }

    private getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
                const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview.js'));
                const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview.css'));
                const nonce = Math.random().toString(36).slice(2, 10);
                const cspSource = webview.cspSource; // allows webview.asWebviewUri resources

                // Minimal loader HTML - the Preact app in out/webview.js will post 'ready' and handle 'init'
                return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${cspSource};">
        <title>PyStacker</title>
    </head>
    <body>
        <div id="root"></div>
        <link rel="stylesheet" href="${styleUri}">
        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
</html>`;
    }

    // Revive a panel deserialized by VS Code. This method is public so activate() can delegate to it
    public async revivePanel(webviewPanel: vscode.WebviewPanel, state: any, context: vscode.ExtensionContext) {
        try {
            let pid = state?.processInfo?.pid;
            // If serializer state didn't include threads/processInfo, try workspaceState fallback
            if (!state?.threads || !state?.processInfo) {
                try {
                    const fallbackKey = `pystacker.latest.${pid}`;
                    const fallback = context.workspaceState.get(fallbackKey) as any;
                    if (fallback && fallback.processInfo) {
                        try { this.getOutputChannel().appendLine(`revivePanel: using workspaceState fallback for pid=${pid} key=${fallbackKey}`); } catch {}
                        state = { ...state, threads: state?.threads || fallback.threads, processInfo: state?.processInfo || fallback.processInfo };
                        pid = state.processInfo?.pid ?? pid;
                    }
                } catch (e) {
                    try { this.getOutputChannel().appendLine(`revivePanel: workspaceState lookup failed for pid=${pid}: ${String(e)}`); } catch {}
                }
            }
            const { webview } = webviewPanel;
            try { this.getOutputChannel().appendLine(`revivePanel: pid=${pid} — setting HTML and wiring handlers`); } catch {}

            webview.onDidReceiveMessage(message => {
                if (!message || !message.command) return;
                try { this.getOutputChannel().appendLine(`revived webview message: ${JSON.stringify(message)} (pid=${pid})`); } catch {}
                if (message.command === 'ready') {
                    const data = (typeof pid === 'number') ? this.dataByPid.get(pid) || { threads: state.threads || [], processInfo: state.processInfo } : { threads: state?.threads || [], processInfo: state?.processInfo };
                    try { webview.postMessage({ command: 'init', threads: data.threads || [], processInfo: data.processInfo }); this.getOutputChannel().appendLine(`revivePanel: posted init on ready for pid=${pid}`); } catch (e) { this.getOutputChannel().appendLine(`revivePanel: failed to post init on ready pid=${pid}: ${String(e)}`); }
                } else if (message.command === 'refresh') {
                    vscode.commands.executeCommand('pystacker.refresh', message.pid, message.name);
                }
            }, null, context.subscriptions);

            // Ensure the panel has the proper HTML
            webview.html = this.getWebviewContent(webview, context.extensionUri);

            // Store the panel and state so future show()/postError calls target it
            if (typeof pid === 'number') {
                this.panelsByPid.set(pid, webviewPanel);
                this.dataByPid.set(pid, { threads: state.threads || [], processInfo: state.processInfo });
                try { this.getOutputChannel().appendLine(`revivePanel: stored pid=${pid} in panelsByPid/dataByPid`); } catch {}
            }

            // Immediately try to post init to the webview (and again after a short delay) so that
            // we cover races where the webview may have already posted 'ready' before the handler
            // was registered or where messages sent very early are otherwise missed.
            try {
                const data = (typeof pid === 'number') ? this.dataByPid.get(pid) || { threads: state.threads || [], processInfo: state.processInfo } : { threads: state?.threads || [], processInfo: state?.processInfo };
                webview.postMessage({ command: 'init', threads: data.threads || [], processInfo: data.processInfo });
                try { this.getOutputChannel().appendLine(`revivePanel: immediate init posted for pid=${pid}`); } catch {}
            } catch (e) { try { this.getOutputChannel().appendLine(`revivePanel: immediate init failed for pid=${pid}: ${String(e)}`); } catch {} }

            // Fallback: post again shortly after to handle timing vagaries
            setTimeout(() => {
                try {
                    const data = (typeof pid === 'number') ? this.dataByPid.get(pid) || { threads: state.threads || [], processInfo: state.processInfo } : { threads: state?.threads || [], processInfo: state?.processInfo };
                    webview.postMessage({ command: 'init', threads: data.threads || [], processInfo: data.processInfo });
                    try { this.getOutputChannel().appendLine(`revivePanel: delayed init posted for pid=${pid}`); } catch {}
                } catch (e) { try { this.getOutputChannel().appendLine(`revivePanel: delayed init failed for pid=${pid}: ${String(e)}`); } catch {} }
            }, 250);

            webviewPanel.onDidDispose(() => {
                if (typeof pid === 'number') {
                    this.panelsByPid.delete(pid);
                    this.dataByPid.delete(pid);
                    try { this.getOutputChannel().appendLine(`revivePanel: disposed pid=${pid}`); } catch {}
                }
            }, null, context.subscriptions);
        } catch (e) {
            console.warn('Error reviving panel:', e);
            try { this.getOutputChannel().appendLine(`revivePanel: error ${String(e)}`); } catch {}
        }
    }

    /**
     * Register commands and webview serializer. Returns an array of disposables
     * so the caller (activate) can add them to the extension context subscriptions.
     */
    *register(): Generator<vscode.Disposable> {
        yield vscode.commands.registerCommand('pystacker.capture', async (terminal?: vscode.Terminal) => {
            try {
                // Use the provided terminal or fall back to active terminal
                const targetTerminal = terminal || vscode.window.activeTerminal;
                if (!targetTerminal) {
                    vscode.window.showErrorMessage('No terminal found. Please open a terminal first.');
                    return;
                }

                // Get the terminal's process ID
                const terminalPid = await targetTerminal.processId;
                if (!terminalPid) {
                    vscode.window.showErrorMessage('Could not determine terminal process ID.');
                    return;
                }

                // Try to find Python child processes
                let targetPid = terminalPid;
                let processName = 'terminal';
                
                try {
                    const pythonChildren = await this.findPythonChildProcesses(terminalPid);
                    
                    if (pythonChildren.length === 0) {
                        // Warn user if no Python child found
                        const terminalName = targetTerminal.name.toLowerCase();
                        const isProbablyPython = terminalName.includes('python') || terminalName.includes('py');
                        
                        if (!isProbablyPython) {
                            const proceed = await vscode.window.showWarningMessage(
                                `No Python child process found in terminal '${targetTerminal.name}' (PID: ${terminalPid}).\n\nDo you want to try capturing the terminal process itself? (This will likely fail if it's not Python)`,
                                { modal: true },
                                'Yes, Try Anyway'
                            );
                            
                            if (proceed !== 'Yes, Try Anyway') {
                                return;
                            }
                        }
                    } else if (pythonChildren.length === 1) {
                        // Single Python process found
                        targetPid = pythonChildren[0].pid;
                        processName = pythonChildren[0].name;
                        const cmdInfo = pythonChildren[0].cmdline ? ` - ${pythonChildren[0].cmdline.substring(0, 50)}` : '';
                    } else {
                        // Multiple Python processes found - let user choose
                        const items = pythonChildren.map(proc => ({
                            label: `${proc.name} (PID: ${proc.pid})`,
                            description: proc.cmdline ? proc.cmdline.substring(0, 80) : undefined,
                            pid: proc.pid,
                            name: proc.name
                        }));
                        
                        items.push({
                            label: '$(debug-stackframe-focused) Capture All Python Processes',
                            description: `Found ${pythonChildren.length} Python processes`,
                            pid: -1, // Special marker for "all"
                            name: 'all'
                        });
                        
                        const selected = await vscode.window.showQuickPick(items, {
                            placeHolder: `Found ${pythonChildren.length} Python processes. Choose one to capture:`,
                            ignoreFocusOut: true
                        });
                        
                        if (!selected) {
                            return; // User cancelled
                        }
                        
                        if (selected.pid === -1) {
                            // Capture all Python processes
                            for (const proc of pythonChildren) {
                                try {
                                    await this.captureStackForPid(this.context, proc.pid, proc.name);
                                } catch (err: any) {
                                    this.postErrorToPanel(proc.pid, `Failed to capture ${proc.name} (PID: ${proc.pid}): ${err.message}`);
                                }
                            }
                            return; // Exit after capturing all
                        } else {
                            targetPid = selected.pid;
                            processName = selected.name;
                        }
                    }
                } catch (err) {
                    // If process tree query fails, continue with terminal PID
                    console.warn('Failed to query process tree:', err);
                }
                
                // Use bundled py-spy from extension's venv
                const pyspyPath = getBundledPySpyPath(this.context);
                
                // Get configuration
                const config = vscode.workspace.getConfiguration('pystacker');
                const outputFormat = config.get<string>('outputFormat', 'json');
                const includeSubprocesses = config.get<boolean>('includeSubprocesses', false);
                const showLocalVariables = config.get<boolean>('showLocalVariables', false);
                
                // Build py-spy command with flags
                const flags: string[] = ['dump', '--pid', targetPid.toString()];
                if (outputFormat === 'json') {
                    flags.push('--json');
                }
                if (includeSubprocesses) {
                    flags.push('--subprocesses');
                }
                if (showLocalVariables) {
                    flags.push('--locals');
                }
                
                // Show progress notification
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Capturing stack trace for ${processName} (PID: ${targetPid})...`,
                    cancellable: false
                }, async (progress) => {
                    return new Promise<void>(async (resolve, reject) => {
                        try {
                            // Build py-spy arguments (dump outputs to stdout, no -o flag)
                            const args = [...flags];
                            
                            // Spawn py-spy process
                            const child = spawn.sync(pyspyPath, args, {
                                encoding: 'utf-8',
                                timeout: 15000,
                                windowsHide: true
                            });
                            
                            if (child.error) {
                                throw child.error;
                            }
                            
                            if (child.status !== 0) {
                                const errorMsg = child.stderr || child.stdout || 'Unknown error';
                                throw new Error(errorMsg);
                            }
                            
                            // Get output from stdout
                            let content = child.stdout || '';
                            
                            // Format JSON output for readability
                            if (outputFormat === 'json' && content) {
                                try {
                                    const jsonData = JSON.parse(content);
                                    this.show(this.context, jsonData, { pid: targetPid, name: processName });
                                } catch (e) {
                                    console.warn('Failed to parse JSON output, opening raw output in editor:', e);
                                    try {
                                        const doc = await vscode.workspace.openTextDocument({ content, language: 'json' });
                                        await vscode.window.showTextDocument(doc);
                                    } catch (err) {
                                        // If a panel exists for this pid, post the error there so the webview can display it.
                                        try {
                                            this.postErrorToPanel(targetPid, 'Failed to parse JSON output from py-spy and could not open editor for raw output.');
                                        } catch {
                                            vscode.window.showErrorMessage('Failed to parse JSON output from py-spy and could not open editor for raw output.');
                                        }
                                    }
                                }
                            } else {
                                // Text output - open in an untitled editor
                                try {
                                    const doc = await vscode.workspace.openTextDocument({ content, language: 'text' });
                                    await vscode.window.showTextDocument(doc);
                                } catch (err) {
                                    try { this.postErrorToPanel(targetPid, 'Captured stack trace (text) ¼ failed to open editor.'); } catch { vscode.window.showInformationMessage('Captured stack trace (text) ¼ failed to open editor.'); }
                                }
                            }
                            
                            resolve();
                        } catch (error: any) {
                            // Check for common py-spy error messages
                            const errorMsg = error.message || '';
                            if (errorMsg.includes('Failed to find python version')) {
                                reject(new Error(`The process (PID: ${targetPid}) is not a Python process. py-spy can only capture stack traces from running Python programs. Try:\n1. Run a Python script in the terminal first\n2. Use the command on a terminal running 'python' or 'python script.py'`));
                            } else if (errorMsg.includes('permission denied') || errorMsg.includes('Access is denied')) {
                                reject(new Error(`Permission denied. py-spy requires admin/root privileges to attach to processes. Try:\n1. Run VS Code as Administrator (Windows)\n2. Use sudo (Linux/macOS)\n3. Or run py-spy on your own Python processes`));
                            } else {
                                reject(new Error(`py-spy failed: ${errorMsg}`));
                            }
                        }
                    });
                });
            } catch (err: any) {
                vscode.window.showErrorMessage(`Error: ${err?.message ?? String(err)}`);
            }
        });

        yield vscode.commands.registerCommand('pystacker.refresh', async (pid: number, name?: string) => {
            try {
                if (!pid) {
                    vscode.window.showErrorMessage('pystacker.refresh called without a PID');
                    return;
                }
                // Re-run the capture helper which will open/update the webview when JSON output is produced
                await this.captureStackForPid(this.context, pid, name ?? `pid:${pid}`);
            } catch (err: any) {
                this.postErrorToPanel(pid, `Failed to refresh stack for PID ${pid}: ${err?.message ?? String(err)}`);
            }
        });

        // Register a serializer so VS Code can restore webview panels across window reloads
        yield vscode.window.registerWebviewPanelSerializer('pystacker.stack', this);
    }

    async captureStackForPid(context: vscode.ExtensionContext, pid: number, processName: string = 'python'): Promise<void> {
        const config = vscode.workspace.getConfiguration('pystacker');
        const outputFormat = config.get<string>('outputFormat', 'json');
        const includeSubprocesses = config.get<boolean>('includeSubprocesses', false);
        const showLocalVariables = config.get<boolean>('showLocalVariables', false);
        
        // Build py-spy command flags
        const flags: string[] = [];
        if (outputFormat === 'json') {
            flags.push('--json');
        }
        if (includeSubprocesses) {
            flags.push('--subprocesses');
        }
        if (showLocalVariables) {
            flags.push('--locals');
        }
        
        const pyspyPath = getBundledPySpyPath(context);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Capturing stack trace for ${processName} (PID: ${pid})...`,
            cancellable: false
        }, async () => {
            return new Promise<void>(async (resolve, reject) => {
                try {
                    // Build py-spy arguments (dump outputs to stdout, no -o flag)
                    const args = ['dump', '--pid', pid.toString(), ...flags];
                    
                    // Spawn py-spy process
                    const child = spawn.sync(pyspyPath, args, {
                        encoding: 'utf-8',
                        timeout: 15000,
                        windowsHide: true
                    });
                    
                    if (child.error) {
                        throw child.error;
                    }
                    
                    if (child.status !== 0) {
                        const errorMsg = child.stderr || child.stdout || 'Unknown error';
                        throw new Error(errorMsg);
                    }
                    
                    // Get output from stdout
                    let content = child.stdout || '';

                    // Do not write output to disk. If JSON, show it in the webview; otherwise open a text editor with the content.
                    if (outputFormat === 'json' && content) {
                        try {
                            const jsonData = JSON.parse(content);
                            this.show(this.context, jsonData, { pid, name: processName });
                        } catch (parseErr) {
                            console.warn('Failed to parse JSON output, falling back to text view:', parseErr);
                            // Open raw output in an editor for inspection
                            try {
                                const doc = await vscode.workspace.openTextDocument({ content, language: 'json' });
                                await vscode.window.showTextDocument(doc);
                            } catch (e) {
                                // Fallback: show raw content in an information message if editor open fails
                                vscode.window.showErrorMessage('Failed to parse JSON output from py-spy. See console for details.');
                            }
                        }
                    } else {
                        // Text format - open a new untitled document with the content
                        try {
                            const doc = await vscode.workspace.openTextDocument({ content, language: 'text' });
                            await vscode.window.showTextDocument(doc);
                        } catch (e) {
                            vscode.window.showInformationMessage('Captured stack trace (text) — failed to open editor.');
                        }
                    }
                    resolve();
                } catch (err: any) {
                    const errorMsg = err.message || '';
                    if (errorMsg.includes('Failed to find python version')) {
                        reject(new Error(`The process (PID: ${pid}) is not a Python process. py-spy can only capture stack traces from running Python programs.`));
                    } else if (errorMsg.includes('permission denied') || errorMsg.includes('Access is denied')) {
                        reject(new Error(`Permission denied. py-spy requires admin/root privileges to attach to processes.`));
                    } else {
                        reject(new Error(`py-spy failed: ${errorMsg}`));
                    }
                }
            });
        });
    }

    async findPythonChildProcesses(parentPid: number, foundProcesses: Set<number> = new Set()): Promise<Array<{pid: number, name: string, cmdline?: string}>> {
        const execPromise = promisify(exec);
        
        const pythonProcesses: Array<{pid: number, name: string, cmdline?: string}> = [];
        
        try {
            if (process.platform === 'win32') {
                // Windows: Use PowerShell to query process tree
                const psCommand = `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${parentPid} } | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json`;
                const { stdout } = await execPromise(`powershell -NoProfile -Command "${psCommand}"`, { timeout: 5000 });
                
                if (!stdout || stdout.trim() === '') {
                    return pythonProcesses;
                }
                
                const children = JSON.parse(stdout);
                const childArray = Array.isArray(children) ? children : [children];
                
                // Look for Python processes
                for (const child of childArray) {
                    const pid = child.ProcessId;
                    
                    // Avoid infinite loops
                    if (foundProcesses.has(pid)) {
                        continue;
                    }
                    foundProcesses.add(pid);
                    
                    const name = child.Name?.toLowerCase() || '';
                    if (name.includes('python') || name.includes('py.exe')) {
                        pythonProcesses.push({
                            pid: pid,
                            name: child.Name,
                            cmdline: child.CommandLine
                        });
                    }
                    
                    // Recursively search all children
                    const childPythonProcesses = await this.findPythonChildProcesses(pid, foundProcesses);
                    pythonProcesses.push(...childPythonProcesses);
                }
            } else {
                // Unix: Use pgrep or ps to find children
                try {
                    const { stdout } = await execPromise(`pgrep -P ${parentPid}`, { timeout: 5000 });
                    const childPids = stdout.trim().split('\n').filter((line: string) => line);
                    
                    for (const childPidStr of childPids) {
                        const childPid = parseInt(childPidStr, 10);
                        
                        // Avoid infinite loops
                        if (foundProcesses.has(childPid)) {
                            continue;
                        }
                        foundProcesses.add(childPid);
                        
                        // Check if it's a Python process and get command line
                        try {
                            const { stdout: psOut } = await execPromise(`ps -p ${childPid} -o comm=,args=`, { timeout: 2000 });
                            const psLine = psOut.trim();
                            const [processName, ...argsArray] = psLine.split(/\s+/);
                            const cmdline = argsArray.join(' ');
                            
                            if (processName.includes('python') || processName.includes('py')) {
                                pythonProcesses.push({
                                    pid: childPid,
                                    name: processName,
                                    cmdline: cmdline
                                });
                            }
                            
                            // Recursively search all children
                            const childPythonProcesses = await this.findPythonChildProcesses(childPid, foundProcesses);
                            pythonProcesses.push(...childPythonProcesses);
                        } catch {
                            // Recursively search even if we can't get process info
                            const childPythonProcesses = await this.findPythonChildProcesses(childPid, foundProcesses);
                            pythonProcesses.push(...childPythonProcesses);
                        }
                    }
                } catch {
                    // pgrep not available or no children
                    return pythonProcesses;
                }
            }
            
            return pythonProcesses;
        } catch (error) {
            console.warn('Error finding Python child processes:', error);
            return pythonProcesses;
        }
    }



    async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
        // Delegate to provider to revive the panel (it can access private helpers)
        try {
            this.log(`deserializeWebviewPanel called for viewType=pystacker.stack state pid=${state?.processInfo?.pid ?? 'unknown'}`);
            await this.revivePanel(webviewPanel, state, this.context);
            this.log(`deserializeWebviewPanel completed for pid=${state?.processInfo?.pid ?? 'unknown'}`);
        } catch (e) {
            console.warn('Failed to revive pystacker panel:', e);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    const stackTraceWebviewProvider = new StackTraceWebviewProvider(context);
    context.subscriptions.push(...stackTraceWebviewProvider.register());
}
