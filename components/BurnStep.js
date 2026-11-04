import { useEffect, useState } from 'react';
import { erc20Abi } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import ConnectButton from './ConnectButton';
import { TOKEN_TICKER, shortAddress } from '../lib/config';

// The $50 $CREATIONS burn that opens a developer account or a new game (PLATFORM_SPEC section 4).
// 1. The server prices it: an exact amount, held for 10 minutes, from one of your linked wallets.
// 2. Your wallet sends exactly that to the burn address (you sign it; the site never holds your keys).
// 3. The server finds the burn on chain and records it. onDone({ quoteId, tx }) then lets the form go through.
// Already sent it from another app? Paste the transaction hash instead.
export default function BurnStep({ purpose, usd, account, network, onDone }) {
  const { address: connected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const evm = account.wallets.filter((w) => w.chain === 'evm');
  const [wallet, setWallet] = useState(account.primaryWallet || evm[0]?.address || '');
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState(null); // { busy?, ok?, text }
  const [pasted, setPasted] = useState('');
  const [now, setNow] = useState(Date.now());
  const client = usePublicClient({ chainId: quote?.chainId });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const left = quote ? Math.max(0, Math.floor((Date.parse(quote.expiresAt) - now) / 1000)) : 0;

  const call = async (url, body) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Something went wrong.');
    return out;
  };

  const getQuote = async () => {
    setStatus({ busy: true, text: 'Pricing the burn…' });
    try {
      const out = await call('/api/dev/burn/quote', { purpose, wallet });
      setQuote(out.quote);
      setStatus(null);
    } catch (err) {
      setStatus({ text: err.message });
    }
  };

  const verify = async (tx) => {
    setStatus({ busy: true, text: 'Checking the burn on chain…' });
    try {
      await call('/api/dev/burn/verify', { quoteId: quote.id, tx });
      setStatus({ ok: true, text: 'Burn confirmed.' });
      onDone({ quoteId: quote.id, tx });
    } catch (err) {
      setStatus({ text: err.message });
    }
  };

  const burn = async () => {
    try {
      setStatus({ busy: true, text: 'Confirm the burn in your wallet…' });
      await switchChainAsync({ chainId: quote.chainId });
      const tx = await writeContractAsync({
        address: quote.token,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [quote.to, BigInt(quote.amountRaw)],
        chainId: quote.chainId,
      });
      setStatus({ busy: true, text: 'Waiting for the transaction to confirm…' });
      await client.waitForTransactionReceipt({ hash: tx });
      await verify(tx);
    } catch (err) {
      setStatus({ text: err.shortMessage || err.message });
    }
  };

  const faucet = async () => {
    setStatus({ busy: true, text: 'Sending test tokens…' });
    try {
      await call('/api/deathrace/faucet', { address: wallet });
      setStatus({ ok: true, text: `Test ${TOKEN_TICKER} and a little test ETH are on their way to ${shortAddress(wallet)}.` });
    } catch (err) {
      setStatus({ text: err.message });
    }
  };

  const rightWallet = connected && connected.toLowerCase() === quote?.wallet;

  return (
    <div className="card burn-step">
      <p className="eyebrow">Burn ${usd} of {TOKEN_TICKER}</p>
      <p className="muted small">
        The tokens go to the burn address and are gone for good. Burns keep the store free of spam and count toward the
        total burned shown on the site.
        {network?.testnet && (
          <>
            {' '}
            <strong>Testnet:</strong> this burns test {TOKEN_TICKER} on {network.chainName}, not real tokens.
          </>
        )}
      </p>

      {!quote ? (
        <div className="burn-row">
          <label className="field">
            <span>Burn from</span>
            <select className="admin-input" value={wallet} onChange={(e) => setWallet(e.target.value)}>
              {evm.map((w) => (
                <option key={w.address} value={w.address}>
                  {shortAddress(w.address)} ({w.type === 'embedded' ? 'made for you' : 'linked'})
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={getQuote} disabled={!wallet || status?.busy}>
            Get the amount
          </button>
          {network?.testnet && (
            <button type="button" className="btn btn-ghost" onClick={faucet} disabled={!wallet || status?.busy}>
              Get test {TOKEN_TICKER}
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="burn-amount">
            {Number(quote.tokens).toLocaleString('en-US', { maximumFractionDigits: 0 })} <span>{TOKEN_TICKER}</span>
          </p>
          <p className="muted small">
            Exactly {quote.tokens} {TOKEN_TICKER} from <span className="mono">{shortAddress(quote.wallet)}</span> to the burn
            address on {quote.chainName}.{' '}
            {left > 0 ? `This amount is held for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}.` : 'This amount expired.'}
          </p>
          {left > 0 ? (
            <div className="burn-row">
              {rightWallet ? (
                <button type="button" className="btn btn-primary" onClick={burn} disabled={status?.busy}>
                  Burn now
                </button>
              ) : (
                <>
                  <ConnectButton label={`Connect ${shortAddress(quote.wallet)}`} />
                  {connected && <span className="muted small">Connected: {shortAddress(connected)}. Switch to the wallet above.</span>}
                </>
              )}
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={getQuote}>
              Get a new amount
            </button>
          )}
          <details className="burn-paste">
            <summary className="small">Already sent it? Paste the transaction</summary>
            <div className="burn-row">
              <input
                className="admin-input mono"
                placeholder="0x…"
                value={pasted}
                onChange={(e) => setPasted(e.target.value.trim())}
              />
              <button type="button" className="btn btn-ghost" onClick={() => verify(pasted)} disabled={!pasted || status?.busy}>
                Check
              </button>
            </div>
          </details>
        </>
      )}
      {status && <p className={`small ${status.ok ? '' : status.busy ? 'muted' : 'error'}`}>{status.text}</p>}
    </div>
  );
}
