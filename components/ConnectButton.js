import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { shortAddress } from '../lib/config';

export default function ConnectButton({ className = 'btn btn-primary', label = 'Connect wallet' }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Wallet state only exists in the browser; render the neutral button on the server.
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);

  if (mounted && isConnected) {
    return (
      <button className="btn btn-ghost wallet-chip" onClick={() => disconnect()} title="Disconnect">
        <span className="dot" />
        {shortAddress(address)}
      </button>
    );
  }

  // EIP-6963 wallets show up as their own connectors; hide the generic
  // "Injected" entry when a named one is available.
  const named = connectors.filter((c) => c.id !== 'injected');
  const list = named.length ? named : connectors;

  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Connect a wallet</h3>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <p className="muted small">Use a wallet that holds $creations on Robinhood Chain.</p>

            <div className="connector-list">
              {list.map((connector) => (
                <button
                  key={connector.uid}
                  className="connector"
                  disabled={isPending}
                  onClick={() => connect({ connector })}
                >
                  {connector.icon && <img src={connector.icon} alt="" width={24} height={24} />}
                  <span>{connector.name === 'Injected' ? 'Browser wallet' : connector.name}</span>
                </button>
              ))}
            </div>

            {error && (
              <p className="error small modal-error">
                {error.name === 'ProviderNotFoundError'
                  ? 'No wallet found. Install a browser wallet such as MetaMask or Rabby, then reload.'
                  : error.shortMessage || error.message}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
