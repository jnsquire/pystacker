/// <reference path="./vscode-elements.d.ts" />
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { StackFrame, ThreadDump, LocalData } from '../shared/types.js';
import '@vscode-elements/elements/dist/vscode-collapsible/index.js';
import '@vscode-elements/elements/dist/vscode-icon/index.js';
import '@vscode-elements/elements/dist/vscode-table/index.js';
import '@vscode-elements/elements/dist/vscode-table-header/index.js';
import '@vscode-elements/elements/dist/vscode-table-body/index.js';
import '@vscode-elements/elements/dist/vscode-table-header-cell/index.js';
import '@vscode-elements/elements/dist/vscode-table-row/index.js';
import '@vscode-elements/elements/dist/vscode-table-cell/index.js';
import '@vscode-elements/elements/dist/vscode-badge/index.js';
import '@vscode-elements/elements/dist/vscode-button/index.js';
import '@vscode-elements/elements/dist/vscode-progress-ring/index.js';
import styles from './app.module.css';
import { createVsCodeApi } from './vscodeApi.js';

export type WebviewState = {
    threads: ThreadDump[];
    processInfo: { pid: number; name: string } | null;
    lastUpdated: string | null;
};

const { VsCodeApiProvider, useVsCodeApi } = createVsCodeApi<WebviewState>();

function Frame({ frame }: { frame: StackFrame }) {
  const locals = frame.locals ?? [];
  const addHighlight = (addrClass?: string) => {
    if (!addrClass) return;
    const els = document.getElementsByClassName(addrClass);
    if (els.length > 1) {
      Array.from(els).forEach((el) => el.classList.add('addr-highlight'));
    }
  };

  const removeHighlight = (addrClass?: string) => {
    if (!addrClass) return;
    const els = document.getElementsByClassName(addrClass);
    Array.from(els).forEach((el) => el.classList.remove('addr-highlight'));
  };
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
          {/* Use vscode-table with resizable columns for nicer alignment and native VS Code look */}
          <vscode-table resizable bordered bordered-columns class={styles.localsTable}>
            <vscode-table-header>
              <vscode-table-header-cell>Name</vscode-table-header-cell>
              <vscode-table-header-cell>Value</vscode-table-header-cell>
              <vscode-table-header-cell>Addr</vscode-table-header-cell>
            </vscode-table-header>
            <vscode-table-body>
              {locals.map((loc: LocalData, idx: number) => {
                const rawAddr = loc.addr ?? '';
                const addrClass = rawAddr !== '' ? `addr_${String(rawAddr).replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
                return (
                  <vscode-table-row key={`${loc.name ?? 'local'}-${idx}`} class={addrClass}
                      onMouseEnter={() => addHighlight(addrClass)}
                      onMouseLeave={() => removeHighlight(addrClass)}>
                    <vscode-table-cell title={rawAddr ? `addr: ${rawAddr}` : undefined} class={addrClass}>
                      {loc.name}
                    </vscode-table-cell>
                    <vscode-table-cell
                      title={rawAddr ? `addr: ${rawAddr}` : undefined}
                      class={addrClass}
                    >
                      {loc.repr}
                    </vscode-table-cell>
                    <vscode-table-cell class={addrClass} title={rawAddr ? `addr: ${rawAddr}` : undefined}>
                      {rawAddr}
                    </vscode-table-cell>
                  </vscode-table-row>
                );
              })}
            </vscode-table-body>
          </vscode-table>
        </div>
      )}
    </div>
  );
}

function ThreadView({ thread }: { thread: ThreadDump }) {
  const frames = (thread.frames || []).slice().reverse();
  const processInfoJson = thread.process_info == null ? null : JSON.stringify(thread.process_info, null, 2);
  return (
    <vscode-collapsible open heading={thread.thread_name || 'Thread'} description={`pid ${thread.pid} ${!thread.active ? '(inactive)' : ''} ${thread.owns_gil ? '(owns_gil)' : '(no_gil)'}`}>
      <div className={styles.threadContent}>
        {processInfoJson && (
          <pre className={`json ${styles.mono}`}>
            {processInfoJson}
          </pre>
        )}
        {frames.length === 0 ? (
          <div>No frames captured</div>
        ) : (
          frames.map((f: StackFrame, idx: number) => <Frame key={`${thread.thread_id ?? 'thread'}-${idx}`} frame={f} />)
        )}
      </div>
    </vscode-collapsible>
  );
}

function App() {
  const [threads, setThreads] = useState<ThreadDump[]>([]);
  const [processInfo, setProcessInfo] = useState<{ pid: number; name: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const api = useVsCodeApi();

  const handleRefresh = useCallback(() => {
    setError(null);
    setLoading(true);
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setLoading(false);
      setError('Timed out waiting for capture response (30s)');
      timeoutRef.current = null;
    }, 30000);
    api?.postMessage({ command: 'refresh', pid: processInfo?.pid, name: processInfo?.name });
  }, [api, processInfo]);

  useEffect(() => {
    // If the webview was restored by VS Code it may have saved state we can use immediately
    try {
      const saved = api?.getState?.();
      try { console.debug('webview: getState returned', saved); } catch {}
      if (saved && saved.threads && saved.processInfo) {
        setThreads(saved.threads || []);
        setProcessInfo(saved.processInfo || null);
        setLastUpdated(saved.lastUpdated || new Date().toLocaleString());
        setLoading(false);
        setError(null);
      }
    } catch (e) {
      try { console.debug('webview: getState failed', e); } catch {}
      // ignore if acquireVsCodeApi isn't available in this environment
    }

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data;
      try { console.debug('webview: received message', msg); } catch {}
      if (!msg || !msg.command) return;
      if (msg.command === 'init') {
        setThreads(msg.threads || []);
        setProcessInfo(msg.processInfo || null);
        setLastUpdated(new Date().toLocaleString());
        setLoading(false);
        setStale(false);
        setError(null);
        if (timeoutRef.current != null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        // Persist this state so VS Code can restore it when the webview is deserialized
        try { api?.setState?.({ threads: msg.threads || [], processInfo: msg.processInfo || null, lastUpdated: new Date().toLocaleString() }); } catch {}
      } else if (msg.command === 'error') {
        setLoading(false);
        setError(msg.message || 'Unknown error');
        if (timeoutRef.current != null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else if (msg.command === 'stale') {
        setStale(true);
        setLoading(false);
      } else if (msg.command === 'fresh') {
        setStale(false);
        setLoading(false);
  }
    };

    window.addEventListener('message', onMessage);
    // Ensure we aren't left in a loading state after mount (for revived panels)
    try { setLoading(false); } catch {}

    return () => {
      window.removeEventListener('message', onMessage);
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Keep persisted VS Code webview state in sync whenever threads/processInfo change
  useEffect(() => {
    try {
      if (api?.setState) {
        api.setState({ threads, processInfo, lastUpdated });
      }
    } catch {
      // ignore
    }
  }, [api, threads, processInfo, lastUpdated]);

  return (
    <div>
      <div style={{display:'flex',alignItems:'center'}}>
        <h1 style={{margin:0}}>Stack Trace: {processInfo?.name} (PID: {processInfo?.pid})</h1>
        <div style={{marginLeft:'auto'}}>
          {/* Use a vscode-button (from vscode-elements) for a native look */}
          <div style={{display:'inline-flex', alignItems:'center', gap:8}}>
              <div className={`${styles.lastUpdated} ${stale ? styles.stale : ''}`} title={lastUpdated ?? ''}>{loading ? 'Capturing stack trace…' : (lastUpdated ? `Last updated: ${lastUpdated}` : '')}</div>
              <vscode-button id="refreshBtn" appearance="secondary" disabled={!processInfo || loading || stale} onClick={handleRefresh}>
                <span className={styles.buttonContent}>Refresh
                  <span className={styles.buttonSpinner} aria-hidden={!loading}>
                    <vscode-progress-ring style={{width:16, height:16, opacity: loading ? 1 : 0}}></vscode-progress-ring>
                  </span>
                </span>
              </vscode-button>
          </div>
        </div>
      </div>
      {error && (
        <div style={{marginTop: 8, color: 'var(--vscode-inputValidation-errorForeground, #f14c4c)'}}>{error}</div>
      )}
      <div id="container">
        {threads.map((th, idx) => (
          <ThreadView key={`thread-${th.thread_id ?? th.pid ?? idx}`} thread={th} />
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root') ?? document.body).render(
  <React.StrictMode>
    <VsCodeApiProvider>
      <App />
    </VsCodeApiProvider>
  </React.StrictMode>
);
