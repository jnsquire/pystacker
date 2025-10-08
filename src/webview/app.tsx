/// <reference path="./vscode-elements.d.ts" />
import { h, render, createContext } from 'preact';
import { useState, useEffect, useContext, useRef } from 'preact/hooks';
import type { LocalData, StackFrame, ThreadDump } from '../shared/types';
// Register VS Code Web Components (vscode-elements)
import '@vscode-elements/elements';

// Workaround for TSX typing: use string tag wrappers to avoid relying on global JSX d.ts
const VscButton: any = 'vscode-button';
const VscPanel: any = 'vscode-panel';
const VscProgressRing: any = 'vscode-progress-ring';

// VS Code API context/provider to centralize acquireVsCodeApi()
const VsCodeApiContext = createContext<any>({});

function VsCodeApiProvider({ children } : { children: any }){
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

function Escaped({children}:{children:any}){
  return <span>{String(children)}</span>;
}

function Frame({frame, expanded, registerAddr, unregisterAddr}:{frame:StackFrame, expanded:boolean, registerAddr:(addr:string|null|undefined, el:HTMLElement|null)=>void, unregisterAddr:(addr:string|null|undefined, el:HTMLElement|null)=>void}){
  return (
    <div class="frame">
      <div class="frame-header">
        <div class="frame-title">{frame.name || '<unknown>'}</div>
        <div class="frame-meta">{frame.module ? `module: ${frame.module}` : ''} {frame.short_filename || frame.filename ? `${frame.short_filename || frame.filename}:${frame.line ?? '?'}` : ''}</div>
      </div>
      {frame.locals && frame.locals.length>0 && (
        <div class="locals-list">
          {frame.locals.map(loc => {
            const rawAddr = loc.addr ?? '';
            const addrClass = rawAddr !== '' ? `addr_${String(rawAddr).replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
            // closure-scoped references used to unregister exact elements on unmount
            let containerEl: HTMLElement | null = null;
            let nameEl: HTMLElement | null = null;
            let reprEl: HTMLElement | null = null;
            return (
              <div class={`local-item ${addrClass}`} ref={(el:HTMLElement|null) => {
                if (el) { containerEl = el; registerAddr(addrClass, el); } else { unregisterAddr(addrClass, containerEl); containerEl = null; }
              }}>
                <div class={`local-name ${loc.arg? 'arg':''} ${addrClass}`} title={rawAddr ? `addr: ${rawAddr}` : undefined} ref={(el:HTMLElement|null) => {
                  if (el) { nameEl = el; registerAddr(addrClass, el); } else { unregisterAddr(addrClass, nameEl); nameEl = null; }
                }}><code>{loc.name}</code></div>
                <div class="var-repr" title={rawAddr ? `addr: ${rawAddr}` : undefined} ref={(el:HTMLElement|null) => {
                  if (el) { reprEl = el; registerAddr(addrClass, el); } else { unregisterAddr(addrClass, reprEl); reprEl = null; }
                }}><code>{loc.repr}</code></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThreadView({thread, registerAddr, unregisterAddr}:{thread:ThreadDump, registerAddr:(addr:string|null|undefined, el:HTMLElement|null)=>void, unregisterAddr:(addr:string|null|undefined, el:HTMLElement|null)=>void}){
  const frames = (thread.frames || []).slice().reverse();
  const lastIndex = frames.length-1;
  return (
  // Use vscode-panel for a nicer presentation inside VS Code webview
  <VscPanel class="thread-panel">
      <div slot="header" class="thread-panel-header">
        <div class="thread-title">{thread.thread_name || 'Thread'} (thread_id: {thread.thread_id ?? 'n/a'})</div>
        <div class="badges">
          <span class="badge">pid: {thread.pid}</span>
          {thread.os_thread_id != null && <span class="badge">os_tid: {thread.os_thread_id}</span>}
          <span class="badge">{thread.active? 'active':'inactive'}</span>
          <span class="badge">{thread.owns_gil? 'owns_gil':'no_gil'}</span>
        </div>
      </div>
      <div class="thread-content">
        {thread.process_info && <pre class="json mono">{JSON.stringify(thread.process_info, null, 2)}</pre>}
        {frames.length===0 ? <div>No frames captured</div> : frames.map((f, idx) => <Frame frame={f} expanded={idx===lastIndex} registerAddr={registerAddr} unregisterAddr={unregisterAddr} />)}
      </div>
  </VscPanel>
  );
}

function App(){
  const [threads, setThreads] = useState<ThreadDump[]>([]);
  const [processInfo, setProcessInfo] = useState<{pid:number,name:string}|null>(null);
  const [lastUpdated, setLastUpdated] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = ({} as any) as { current: number | null };
  // Map of addr_* class -> Set<HTMLElement> managed by ref callbacks from Frame
  const addrMapRef = useRef<Map<string, Set<HTMLElement>>>(new Map());
  const api = useContext(VsCodeApiContext);

  // NOTE: we clear the registry when new init data arrives (before calling setThreads)
  // to avoid clearing it after ref callbacks have run (which would remove registrations).

  // register/unregister helpers used by Frame via ref callbacks
  const registerAddr = (addrClass: string | null | undefined, el: HTMLElement | null) => {
    if (!addrClass || !el) return;
    try {
      const map = addrMapRef.current;
      let set = map.get(addrClass);
      if (!set) { set = new Set(); map.set(addrClass, set); }
      set.add(el);
    } catch (e) { /* ignore */ }
  };

  const unregisterAddr = (addrClass: string | null | undefined, el: HTMLElement | null) => {
    if (!addrClass || !el) return;
    try {
      const map = addrMapRef.current;
      const set = map.get(addrClass);
      if (!set) return;
      set.delete(el);
      if (set.size === 0) map.delete(addrClass);
    } catch (e) { /* ignore */ }
  };

  // hover debounce refs: small delay before applying highlight to avoid flicker during fast mouse movements
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverAddrRef = useRef<string | null>(null);

  const clearHighlights = () => {
    try { addrMapRef.current.forEach(set => set.forEach(n => n.classList.remove('addr-highlight'))); } catch {}
  };

  const highlightAddr = (addrClass: string | null) => {
    if (!addrClass) return;
    try {
      clearHighlights();
      const set = addrMapRef.current.get(addrClass);
      if (!set) return;
      set.forEach(n => n.classList.add('addr-highlight'));
    } catch {}
  };

  // ensure timeouts are cleared if the component unmounts
  useEffect(() => {
    return () => { if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current as any); hoverTimeoutRef.current = null; } };
  }, []);

  useEffect(()=>{
    // listen for extension init message
      const onMessage = (ev:MessageEvent) => {
      const msg = ev.data;
      if (!msg || !msg.command) return;
      if (msg.command==='init'){
        try { addrMapRef.current.clear(); } catch {}
        setThreads(msg.threads||[]);
        setProcessInfo(msg.processInfo||null);
        setLastUpdated(new Date().toLocaleString());
          setLoading(false);
          setError(null);
          // clear timeout
          try { if (timeoutRef.current) { clearTimeout(timeoutRef.current as any); timeoutRef.current = null; } } catch {}
        } else if (msg.command === 'error') {
          setLoading(false);
          setError(msg.message || 'Unknown error');
          try { if (timeoutRef.current) { clearTimeout(timeoutRef.current as any); timeoutRef.current = null; } } catch {}
      }
    };

    window.addEventListener('message', onMessage);
    return ()=> window.removeEventListener('message', onMessage);
  },[]);

  return (
    <div>
      <style>{`
        :root {
          --bg: var(--vscode-editor-background, #1e1e1e);
          --fg: var(--vscode-editor-foreground, #dddddd);
          --muted: rgba(200,200,200,0.45);
          --panel-bg: var(--vscode-sideBar-background, rgba(0,0,0,0.06));
          --accent: var(--vscode-focusBorder, #007acc);
          --badge-bg: rgba(0,0,0,0.12);
          --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Courier New', monospace;
        }

        html, body {
          margin: 0; padding: 12px; box-sizing: border-box;
          background: var(--bg); color: var(--fg); font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial);
          font-size: 13px; -webkit-font-smoothing:antialiased;
        }

        h1 { font-size: 1.05rem; margin: 0; font-weight: 600; color: var(--fg); }

        .meta { color: var(--muted); margin-top: 6px; margin-bottom: 8px; }

        .thread-panel { display: block; margin: 10px 0; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 0 rgba(0,0,0,0.25); }
        .thread-panel::part(header) { padding: 8px 12px; }
        .thread-panel-header { display:flex; align-items:center; gap:12px; }

        .thread-content { padding: 10px 12px; background: linear-gradient(180deg, rgba(255,255,255,0.01), rgba(0,0,0,0.02)); }

        .thread-title { font-weight: 600; color: var(--fg); }
        .badges { margin-left: auto; display:flex; gap:8px; align-items:center; }
        .badge { background: rgba(125,125,125,0.12); color: var(--fg); padding: 3px 7px; border-radius: 12px; font-size: 12px; }

        .frame { border-left: 3px solid rgba(0,0,0,0.08); padding: 8px 12px; margin: 6px 0; background: rgba(0,0,0,0.02); border-radius: 4px; }
        .frame-header { display:flex; align-items:center; gap:12px; }
        .frame-title { font-weight: 500; }
        .frame-meta { color: var(--muted); font-size: 12px; }

        .locals-list { margin-top:8px; display:flex; flex-direction:column; gap:6px; }
        .local-item { display:flex; gap:12px; align-items:flex-start; }
        .local-name { width:160px; color: var(--muted); font-family: var(--mono); }
        .var-repr { flex:1; font-family: var(--mono); background: rgba(0,0,0,0.02); padding:4px 8px; border-radius:4px; }
        .local-item.addr-highlight {
          background: linear-gradient(90deg, rgba(0,122,204,0.08), rgba(0,0,0,0.02));
          border-radius:4px;
          /* subtle outline to make highlights more discoverable without being loud */
          /* fallback halo (uses hard-coded color) for older hosts */
          box-shadow: 0 0 0 3px rgba(0,122,204,0.06);
          outline: 1px solid rgba(0,122,204,0.10);
          /* prefer using the theme accent color when available; color-mix is supported in modern Chromium */
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
          outline: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
          transition: box-shadow 120ms ease, outline-color 120ms ease;
        }

        /* Keep the variable name simple when highlighted: no extra outline/halo (only the row shows it) */
        .local-name.addr-highlight {
          box-shadow: none !important;
          outline: none !important;
          /* keep the variable name readable but don't add an extra background flash */
          background: transparent !important;
        }

        pre.mono { background: rgba(0,0,0,0.03); padding:8px; border-radius:4px; font-family: var(--mono); font-size:12px; overflow:auto; }

        /* Buttons and header layout */
        #refreshBtn { margin-left: 8px; }
      `}</style>
      <div style={{display:'flex',alignItems:'center'}}>
        <h1 style={{margin:0}}>Stack Trace: {processInfo?.name} (PID: {processInfo?.pid})</h1>
        <div style={{marginLeft:12, color:'#888', fontSize:'0.9rem'}}>
          {lastUpdated ? `Last updated: ${lastUpdated}` : ''}
        </div>
        <div style={{marginLeft:'auto'}}>
          {/* Use a vscode-button (from vscode-elements) for a native look */}
          <div style={{display:'inline-flex', alignItems:'center', gap:8}}>
              <VscButton id="refreshBtn" appearance="secondary" disabled={!processInfo || loading} onClick={() => {
                try {
                  setError(null);
                  setLoading(true);
                  // start timeout to show error if no init arrives
                  try { timeoutRef.current = setTimeout(() => {
                    setLoading(false);
                    setError('Timed out waiting for capture response (30s)');
                    timeoutRef.current = null;
                  }, 30000) as unknown as number; } catch {}
                  api?.postMessage({ command: 'refresh', pid: processInfo?.pid, name: processInfo?.name });
                } catch(e) { setLoading(false); }
              }}>Refresh</VscButton>
              <VscProgressRing aria-hidden={!loading} style={{width:20, height:20, display: loading ? 'inline-block' : 'none'}}></VscProgressRing>
          </div>
        </div>
      </div>
      <div class="meta">Rendered {threads.length} thread(s)</div>
      <div id="container" onMouseOver={(e:any) => {
        const target = e.target as HTMLElement;
        if (!target) return;
        const el = target.closest('.local-item, .local-name') as HTMLElement | null;
        if (!el) return;
        const classes = Array.from(el.classList).filter(c => c.startsWith('addr_'));
        if (classes.length === 0) return;
        const addrClass = classes[0];
        // debounce: clear previous timeout and set a new one
        try { if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current as any); hoverTimeoutRef.current = null; } } catch {}
        hoverAddrRef.current = addrClass;
        hoverTimeoutRef.current = setTimeout(() => {
          highlightAddr(hoverAddrRef.current);
          hoverTimeoutRef.current = null;
        }, 120) as unknown as ReturnType<typeof setTimeout>;
      }} onMouseOut={(e:any) => {
        const related = e.relatedTarget as HTMLElement | null;
        // if still inside a local-item, don't clear yet
        if (related && related.closest && related.closest('.local-item')) return;
        try { if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current as any); hoverTimeoutRef.current = null; } } catch {}
        hoverAddrRef.current = null;
        clearHighlights();
      }}>
        {threads.map(th=> <ThreadView thread={th} registerAddr={registerAddr} unregisterAddr={unregisterAddr} />)}
      </div>
    </div>
  );
}

render(
  <VsCodeApiProvider>
    <App />
  </VsCodeApiProvider>,
  document.body
);
