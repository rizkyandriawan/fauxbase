import React, { useEffect, useState } from 'react';
import { STYLES } from '../styles';

interface DataInspectorProps {
  client: any;
}

export function DataInspector({ client }: DataInspectorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);

  const serviceNames = Object.keys(client).filter(
    k => k !== 'auth' && client[k] && typeof client[k].list === 'function',
  );

  useEffect(() => {
    if (!selected && serviceNames.length > 0) {
      setSelected(serviceNames[0]);
    }
  }, [serviceNames.length]);

  useEffect(() => {
    if (!selected) return;
    const service = client[selected];
    if (!service) return;
    service.list({ size: 50 }).then((res: any) => setRecords(res.items ?? [])).catch(() => setRecords([]));
  }, [selected]);

  if (serviceNames.length === 0) {
    return <div style={STYLES.emptyState}>No services registered</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {serviceNames.map(name => (
          <button
            key={name}
            onClick={() => setSelected(name)}
            style={{
              ...STYLES.button,
              ...(selected === name ? { background: '#3b82f6', borderColor: '#3b82f6' } : {}),
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {records.length === 0 ? (
        <div style={STYLES.emptyState}>No records in {selected}</div>
      ) : (
        <table style={STYLES.table}>
          <thead>
            <tr>
              <th style={STYLES.th}>id</th>
              {Object.keys(records[0])
                .filter(k => k !== 'id' && !k.endsWith('At') && !k.endsWith('Id') && !k.endsWith('Name') && k !== 'version' && k !== 'password')
                .slice(0, 3)
                .map(k => (
                  <th key={k} style={STYLES.th}>{k}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r: any) => (
              <tr key={r.id}>
                <td style={STYLES.td}>{r.id?.substring(0, 12)}...</td>
                {Object.keys(records[0])
                  .filter(k => k !== 'id' && !k.endsWith('At') && !k.endsWith('Id') && !k.endsWith('Name') && k !== 'version' && k !== 'password')
                  .slice(0, 3)
                  .map(k => (
                    <td key={k} style={STYLES.td}>{String(r[k] ?? '')}</td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
