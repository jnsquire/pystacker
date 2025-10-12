import React, { createContext, useEffect, useState, useContext } from 'react';

export type WebviewMessage = {
    command: string;
    [key: string]: unknown;
};

export type VsCodeApi<TState = unknown> = {
    postMessage: (message: WebviewMessage) => void;
    setState?: (state: TState) => TState;
    getState?: () => TState | undefined;
};

type VsCodeApiArtifacts<TState> = {
    Context: React.Context<VsCodeApi<TState> | null>;
    VsCodeApiProvider: ({ children }: { children: React.ReactNode }) => React.ReactElement;
    useVsCodeApi: () => VsCodeApi<TState> | null;
};

export function createVsCodeApi<TState>(): VsCodeApiArtifacts<TState> {
    const Context = createContext<VsCodeApi<TState> | null>(null);

    function VsCodeApiProvider({ children }: { children: React.ReactNode }) {
        const [api] = useState<VsCodeApi<TState> | null>(() => {
            try {
                const acquired = (window as any).acquireVsCodeApi() as VsCodeApi<TState>;
                return acquired;
            } catch {
                return null;
            }
        });

        useEffect(() => {
            try {
                api?.postMessage({ command: 'ready' });
            } catch (e) {
                try { console.debug('webview: failed to post ready', e); } catch {}
            }
        }, [api]);

        return <Context.Provider value={api}>{children}</Context.Provider>;
    }

    function useVsCodeApi(): VsCodeApi<TState> | null {
        return useContext(Context);
    }

    return { Context, VsCodeApiProvider, useVsCodeApi };
}
