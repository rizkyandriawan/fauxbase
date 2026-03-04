import React, { useState } from 'react';
import { STYLES } from '../styles';

interface SeedManagerProps {
  client: any;
}

export function SeedManager({ client }: SeedManagerProps) {
  const [resetting, setResetting] = useState(false);

  const serviceNames = Object.keys(client).filter(
    k => k !== 'auth' && client[k] && typeof client[k].list === 'function',
  );

  const handleReset = async (name: string) => {
    setResetting(true);
    try {
      // Check if the driver has a clear method (LocalDriver only)
      const service = client[name];
      if (service?.driver?.clear) {
        service.driver.clear(name);
      }
    } finally {
      setResetting(false);
    }
  };

  if (serviceNames.length === 0) {
    return <div style={STYLES.emptyState}>No services registered</div>;
  }

  return (
    <div>
      <div style={{ ...STYLES.label, marginBottom: '12px' }}>
        Reset seed data for individual resources (LocalDriver only)
      </div>
      {serviceNames.map(name => (
        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span>{name}</span>
          <button
            style={{ ...STYLES.button, ...STYLES.buttonDanger }}
            onClick={() => handleReset(name)}
            disabled={resetting}
          >
            Reset
          </button>
        </div>
      ))}
    </div>
  );
}
