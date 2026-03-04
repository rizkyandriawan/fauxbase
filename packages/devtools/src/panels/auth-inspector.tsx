import React from 'react';
import { STYLES } from '../styles';

interface AuthInspectorProps {
  client: any;
}

export function AuthInspector({ client }: AuthInspectorProps) {
  const auth = client.auth;

  if (!auth) {
    return <div style={STYLES.emptyState}>Auth not configured</div>;
  }

  return (
    <div>
      <div style={STYLES.label}>Status</div>
      <div style={{ ...STYLES.value, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            ...STYLES.badge,
            ...(auth.isLoggedIn ? STYLES.badgeSuccess : STYLES.badgeError),
          }}
        >
          {auth.isLoggedIn ? 'Logged In' : 'Logged Out'}
        </span>
      </div>

      {auth.isLoggedIn && (
        <>
          <div style={STYLES.label}>User</div>
          <div style={STYLES.value}>
            {auth.currentUser?.email ?? auth.currentUser?.id ?? 'Unknown'}
          </div>

          <div style={STYLES.label}>Token</div>
          <div style={{ ...STYLES.value, fontSize: '11px', fontFamily: 'monospace' }}>
            {auth.token?.substring(0, 40)}...
          </div>

          <button
            style={{ ...STYLES.button, ...STYLES.buttonDanger }}
            onClick={() => {
              auth.logout();
              // Force re-render
              window.dispatchEvent(new Event('fauxbase:auth-change'));
            }}
          >
            Logout
          </button>
        </>
      )}
    </div>
  );
}
