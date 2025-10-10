/// <reference path="./vscode-elements.d.ts" />
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { StackFrame, ThreadDump } from '../shared/types';
import '@vscode-elements/elements';
import styles from './app.module.css';

// VS Code API context/provider to centralize acquireVsCodeApi()
const VsCodeApiContext = createContext<any>({});

function VsCodeApiProvider({ children } : { children: React.ReactNode }){
  const [api] = useState(() => {
    try {
      return (window as any).acquireVsCodeApi();
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Notify host that the webview is ready
    try { api?.postMessage({ command: 'ready' }); } catch {}
  }, [api]);

  return <VsCodeApiContext.Provider value={api}>{children}</VsCodeApiContext.Provider>;
}

function Frame({ frame }: { frame: StackFrame }) {
  const locals = frame.locals ?? [];
  return (
    <div className={styles.frame}>
      <div className={styles.frameHeader}>
        <div className={styles.frameTitle}>{frame.name || '<unknown>'}</div>
        <div className={styles.frameMeta}>
          {frame.module ? `module: ${frame.module}` : ''}{' '}
          {frame.short_filename || frame.filename ? `${frame.short_filename || frame.filename}:${frame.line ?? '?'}` : ''}
        </div>
      </div>
      {locals.length > 0 && (
        <div className={styles.localsList}>
          {locals.map((loc, idx) => {
            const rawAddr = loc.addr ?? '';
            const addrClass = rawAddr !== '' ? `addr_${String(rawAddr).replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
            return (
              <div key={`${loc.name ?? 'local'}-${idx}`} className={`${styles.localItem} localItem ${addrClass}`}>
                <div className={`${styles.localName} localName ${loc.arg ? 'arg' : ''} ${addrClass}`} title={rawAddr ? `addr: ${rawAddr}` : undefined}>
                  <code>{loc.name}</code>
                </div>
                <div className={`${styles.varRepr} ${addrClass}`} title={rawAddr ? `addr: ${rawAddr}` : undefined}>
                  <code>{loc.repr}</code>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThreadView({ thread }: { thread: ThreadDump }) {
  const frames = (thread.frames || []).slice().reverse();
  const processInfoJson = thread.process_info == null ? null : JSON.stringify(thread.process_info, null, 2);
  return (
    // Use vscode-panel for a nicer presentation inside VS Code webview
    <vscode-panel class={styles.threadPanel}>
      <div slot="header" className={styles.threadPanelHeader}>
        <div className={styles.threadTitle}>{thread.thread_name || 'Thread'} (thread_id: {thread.thread_id ?? 'n/a'})</div>
        <div className={styles.badges}>
          <span className={styles.badge}>pid: {thread.pid}</span>
          {thread.os_thread_id != null && <span className={styles.badge}>os_tid: {thread.os_thread_id}</span>}
          <span className={styles.badge}>{thread.active ? 'active' : 'inactive'}</span>
          <span className={styles.badge}>{thread.owns_gil ? 'owns_gil' : 'no_gil'}</span>
        </div>
      </div>
      <div className={styles.threadContent}>
        {processInfoJson && (
          <pre className={`json ${styles.mono}`}>
            {processInfoJson}
          </pre>
        )}
        {frames.length === 0 ? (
          <div>No frames captured</div>
        ) : (
          frames.map((f, idx) => <Frame key={`${thread.thread_id ?? 'thread'}-${idx}`} frame={f} />)
        )}
      </div>
    </vscode-panel>
  );
}

function App() {
  const [threads, setThreads] = useState<ThreadDump[]>([]);
  const [processInfo, setProcessInfo] = useState<{ pid: number; name: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const api = useContext(VsCodeApiContext);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || !msg.command) return;
      if (msg.command === 'init') {
  setThreads(msg.threads || []);
  setProcessInfo(msg.processInfo || null);
        setLastUpdated(new Date().toLocaleString());
        setLoading(false);
        setError(null);
        if (timeoutRef.current != null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else if (msg.command === 'error') {
        setLoading(false);
        setError(msg.message || 'Unknown error');
        if (timeoutRef.current != null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div>
      <div style={{display:'flex',alignItems:'center'}}>
        <h1 style={{margin:0}}>Stack Trace: {processInfo?.name} (PID: {processInfo?.pid})</h1>
        <div style={{marginLeft:12, color:'#888', fontSize:'0.9rem'}}>
          {lastUpdated ? `Last updated: ${lastUpdated}` : ''}
        </div>
        <div style={{marginLeft:'auto'}}>
          {/* Use a vscode-button (from vscode-elements) for a native look */}
          <div style={{display:'inline-flex', alignItems:'center', gap:8}}>
              <vscode-button id="refreshBtn" appearance="secondary" disabled={!processInfo || loading} onClick={() => {
                setError(null);
                setLoading(true);
                // start timeout to show error if no init arrives
                if (timeoutRef.current != null) {
                  clearTimeout(timeoutRef.current);
                }
                timeoutRef.current = window.setTimeout(() => {
                  setLoading(false);
                  setError('Timed out waiting for capture response (30s)');
                  timeoutRef.current = null;
                }, 30000);
                api?.postMessage({ command: 'refresh', pid: processInfo?.pid, name: processInfo?.name });
              }}>Refresh</vscode-button>
              <vscode-progress-ring aria-hidden={!loading} style={{width:20, height:20, display: loading ? 'inline-block' : 'none'}}></vscode-progress-ring>
          </div>
        </div>
      </div>
      {loading && (
        <div style={{marginTop: 8, color: 'var(--vscode-descriptionForeground)'}}>Capturing stack trace…</div>
      )}
      {error && (
        <div style={{marginTop: 8, color: 'var(--vscode-inputValidation-errorForeground, #f14c4c)'}}>{error}</div>
      )}
    <div className={styles.meta}>Rendered {threads.length} thread(s)</div>
      <div id="container">
  {threads.map((th, idx) => (
          <ThreadView key={`thread-${th.thread_id ?? th.pid ?? idx}`} thread={th} />
        ))}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root') ?? document.body);
root.render(
  <React.StrictMode>
    <VsCodeApiProvider>
      <App />
    </VsCodeApiProvider>
  </React.StrictMode>
);
