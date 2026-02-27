import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { TransactionHubService } from '../services/TransactionHubService';
import type { AppDispatch } from '../store';

/**
 * Initializes and manages the TransactionHubService lifecycle.
 * Returns the service instance so pages can call fetchPage / refreshStats / sendTransaction.
 *
 * Components read state via useSelector — not from this hook.
 */
export function useTransactionHub(): TransactionHubService {
  const dispatch = useDispatch<AppDispatch>();
  const serviceRef = useRef<TransactionHubService | null>(null);

  if (!serviceRef.current) {
    serviceRef.current = new TransactionHubService(dispatch);
  }

  useEffect(() => {
    serviceRef.current!.start();
    return () => { serviceRef.current!.stop(); };
  }, []);

  return serviceRef.current;
}
