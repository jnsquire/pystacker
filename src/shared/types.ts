// Shared types between extension host and webview client
export interface LocalData {
  name: string;
  addr?: number | null;
  arg?: boolean;
  repr?: string;
}

export interface StackFrame {
  name?: string;
  filename?: string;
  module?: string | null;
  short_filename?: string;
  line?: number;
  locals?: LocalData[];
}

export interface ThreadDump {
  active: boolean;
  owns_gil: boolean;
  pid: number;
  thread_id: number;
  thread_name: string;
  os_thread_id?: number;
  frames?: StackFrame[];
  process_info?: unknown;
}
