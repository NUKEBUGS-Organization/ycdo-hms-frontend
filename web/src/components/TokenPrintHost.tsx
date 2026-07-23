import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import type { Token } from '../types/api';
import { TokenPrintSlip } from './TokenPrintSlip';

type Listener = (token: Token | null) => void;

let listener: Listener | null = null;

/** Queue a slip for printing. Call only after the token is already saved. */
export function printSavedToken(token: Token): void {
  listener?.(token);
}

/** Fetch any token by id and reopen the slip (print failure-safe reprint). */
export async function reprintTokenById(tokenId: string): Promise<void> {
  const token = await api<Token>(`/tokens/${tokenId}`);
  printSavedToken(token);
}

/**
 * Mounts the print-only slip and triggers window.print() after paint.
 * Print errors never roll back a save — this only runs on already-persisted tokens.
 */
export function TokenPrintHost() {
  const [token, setToken] = useState<Token | null>(null);

  useEffect(() => {
    listener = setToken;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    const onAfterPrint = () => setToken(null);
    window.addEventListener('afterprint', onAfterPrint);

    // Wait a frame so the slip is in the DOM before the print dialog.
    const t = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // Printer / dialog failure must not affect the saved token.
        setToken(null);
      }
    }, 50);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, [token]);

  if (!token) return null;

  return createPortal(
    <div className="token-print-root" aria-hidden>
      <TokenPrintSlip token={token} />
    </div>,
    document.body,
  );
}
