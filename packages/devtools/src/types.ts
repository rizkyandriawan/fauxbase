export interface RequestLogEntry {
  id: string;
  timestamp: number;
  service: string;
  method: string;
  args: any[];
  result?: any;
  error?: string;
  duration: number;
}

export type PanelTab = 'data' | 'auth' | 'requests' | 'seeds';

export interface DevtoolsConfig {
  position?: 'bottom-right' | 'bottom-left';
  defaultOpen?: boolean;
  maxLogEntries?: number;
}
