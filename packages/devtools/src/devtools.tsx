import React, { useState, useEffect, useCallback } from 'react';
import type { PanelTab, DevtoolsConfig } from './types';
import { createRequestLogger, type RequestLogger } from './request-logger';
import { DataInspector } from './panels/data-inspector';
import { AuthInspector } from './panels/auth-inspector';
import { RequestLog } from './panels/request-log';
import { SeedManager } from './panels/seed-manager';
import { STYLES } from './styles';

interface FauxbaseDevtoolsProps {
  client: any;
  config?: DevtoolsConfig;
}

const TABS: { key: PanelTab; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'auth', label: 'Auth' },
  { key: 'requests', label: 'Requests' },
  { key: 'seeds', label: 'Seeds' },
];

export function FauxbaseDevtools({ client, config = {} }: FauxbaseDevtoolsProps) {
  const [open, setOpen] = useState(config.defaultOpen ?? false);
  const [activeTab, setActiveTab] = useState<PanelTab>('data');
  const [logger] = useState<RequestLogger>(() => createRequestLogger(config.maxLogEntries ?? 100));
  const [, setTick] = useState(0);

  // Subscribe to logger updates for re-render
  useEffect(() => {
    return logger.subscribe(() => setTick(t => t + 1));
  }, [logger]);

  // Wrap services with proxy logger
  const [wrappedClient] = useState(() => {
    const wrapped = { ...client };
    for (const [name, service] of Object.entries(client)) {
      if (name !== 'auth' && service && typeof (service as any).list === 'function') {
        wrapped[name] = logger.wrapService(service as object, name);
      }
    }
    return wrapped;
  });

  const position = config.position ?? 'bottom-right';
  const isLeft = position === 'bottom-left';

  const containerStyle = {
    ...STYLES.container,
    ...(isLeft ? STYLES.containerLeft : {}),
  };

  if (!open) {
    return (
      <div style={containerStyle} data-testid="fauxbase-devtools">
        <button
          style={STYLES.toggleButton}
          onClick={() => setOpen(true)}
          aria-label="Open Fauxbase DevTools"
          data-testid="devtools-toggle"
        >
          {'{ }'}
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle} data-testid="fauxbase-devtools">
      <div style={STYLES.panel}>
        <div style={STYLES.tabBar}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              style={{
                ...STYLES.tab,
                ...(activeTab === tab.key ? STYLES.tabActive : {}),
              }}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`tab-${tab.key}`}
            >
              {tab.label}
            </button>
          ))}
          <button
            style={{ ...STYLES.tab, marginLeft: 'auto' }}
            onClick={() => setOpen(false)}
            aria-label="Close DevTools"
            data-testid="devtools-close"
          >
            x
          </button>
        </div>
        <div style={STYLES.panelContent}>
          {activeTab === 'data' && <DataInspector client={wrappedClient} />}
          {activeTab === 'auth' && <AuthInspector client={client} />}
          {activeTab === 'requests' && (
            <RequestLog
              entries={logger.getEntries()}
              onClear={() => logger.clear()}
            />
          )}
          {activeTab === 'seeds' && <SeedManager client={client} />}
        </div>
      </div>
    </div>
  );
}
