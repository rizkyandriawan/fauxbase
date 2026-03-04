import React from 'react';
import type { RequestLogEntry } from '../types';
import { STYLES } from '../styles';

interface RequestLogProps {
  entries: RequestLogEntry[];
  onClear: () => void;
}

export function RequestLog({ entries, onClear }: RequestLogProps) {
  if (entries.length === 0) {
    return <div style={STYLES.emptyState}>No requests logged yet</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={STYLES.label}>{entries.length} requests</span>
        <button style={STYLES.button} onClick={onClear}>Clear</button>
      </div>
      <table style={STYLES.table}>
        <thead>
          <tr>
            <th style={STYLES.th}>Service</th>
            <th style={STYLES.th}>Method</th>
            <th style={STYLES.th}>Status</th>
            <th style={STYLES.th}>Time</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.id}>
              <td style={STYLES.td}>{entry.service}</td>
              <td style={STYLES.td}>{entry.method}</td>
              <td style={STYLES.td}>
                <span
                  style={{
                    ...STYLES.badge,
                    ...(entry.error ? STYLES.badgeError : STYLES.badgeSuccess),
                  }}
                >
                  {entry.error ? 'ERR' : 'OK'}
                </span>
              </td>
              <td style={STYLES.td}>{entry.duration}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
