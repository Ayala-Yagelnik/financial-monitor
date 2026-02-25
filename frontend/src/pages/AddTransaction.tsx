import { useState, useRef } from 'react';
import type { Transaction, TransactionStatus } from '../types/transaction';

const API_URL = '/api/transactions';
const CURRENCIES = ['USD', 'EUR', 'ILS', 'GBP', 'JPY', 'BTC'];
const STATUSES: TransactionStatus[] = ['Pending', 'Completed', 'Failed'];

function randomTransaction(): Transaction {
  return {
    transactionId: crypto.randomUUID(),
    amount: parseFloat((Math.random() * 10000 + 10).toFixed(2)),
    currency: CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)],
    status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
    timestamp: new Date().toISOString(),
  };
}

interface LoadTestResult {
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  txPerSecond: number;
}

export default function AddTransaction() {
  const [form, setForm] = useState<Partial<Transaction>>({
    transactionId: crypto.randomUUID(),
    amount: 1500.50,
    currency: 'USD',
    status: 'Completed',
    timestamp: new Date().toISOString(),
  });

  const [sentCount, setSentCount]     = useState(0);
  const [isRunning, setIsRunning]     = useState(false);
  const [loadCount, setLoadCount]     = useState(100);
  const [batchSize, setBatchSize]     = useState(10);
  const [result, setResult]           = useState<LoadTestResult | null>(null);
  const [progress, setProgress]       = useState(0);
  const [singleStatus, setSingleStatus] = useState<'idle'|'ok'|'err'>('idle');
  const abortRef = useRef(false);

  // Send single transaction
  async function sendOne(tx: Transaction): Promise<boolean> {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      return res.ok;
    } catch { return false; }
  }

  // Load Test — send N transactions in batches
  async function runLoadTest() {
    abortRef.current = false;
    setIsRunning(true);
    setResult(null);
    setProgress(0);

    const start = performance.now();
    let succeeded = 0;
    let failed = 0;
    let sent = 0;

    // Send in batches to avoid overwhelming the browser
    while (sent < loadCount && !abortRef.current) {
      const currentBatch = Math.min(batchSize, loadCount - sent);
      const batch = Array.from({ length: currentBatch }, randomTransaction);

      const results = await Promise.allSettled(
        batch.map(tx => sendOne(tx))
      );

      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) succeeded++;
        else failed++;
      });

      sent += currentBatch;
      setProgress(Math.round((sent / loadCount) * 100));

      // Give browser a breath between batches
      await new Promise(r => setTimeout(r, 0));
    }

    const durationMs = performance.now() - start;

    setResult({
      total: sent,
      succeeded,
      failed,
      durationMs: Math.round(durationMs),
      txPerSecond: Math.round((succeeded / durationMs) * 1000),
    });

    setSentCount(c => c + succeeded);
    setIsRunning(false);
    setProgress(0);
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h1 style={s.title}>Transaction Simulator</h1>
        <p style={s.subtitle}>Feed mock data into the Financial Monitor engine</p>
        {sentCount > 0 && <div style={s.badge}>{sentCount} transactions sent</div>}
      </div>

      {/* Quick buttons */}
      <div style={s.quickRow}>
        <button style={{...s.btn, ...s.btnBlue}}
          onClick={async () => {
            setSingleStatus('idle');
            const ok = await sendOne(randomTransaction());
            setSingleStatus(ok ? 'ok' : 'err');
            if (ok) setSentCount(c => c + 1);
            setTimeout(() => setSingleStatus('idle'), 2000);
          }}>
          ⚡ Send 1 Random
        </button>

        <button style={{...s.btn, ...s.btnGray}}
          onClick={async () => {
            const txs = Array.from({ length: 10 }, randomTransaction);
            await Promise.allSettled(txs.map(sendOne));
            setSentCount(c => c + 10);
          }}>
          🔥 Quick ×10
        </button>
      </div>

      {singleStatus === 'ok'  && <div style={{...s.alert, ...s.alertGreen}}>✅ Sent!</div>}
      {singleStatus === 'err' && <div style={{...s.alert, ...s.alertRed}}>❌ Failed</div>}

      {/* Load Test */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>🧪 Load Test</h2>
        <p style={s.cardDesc}>
          Test how many transactions the server can handle in N seconds.
          Then go to <code>/monitor</code> to see everything arrived.
        </p>

        <div style={s.configRow}>
          <label style={s.label}>
            Number of transactions
            <input style={s.input} type="number" min={1} max={1000}
              value={loadCount}
              onChange={e => setLoadCount(Number(e.target.value))} />
          </label>

          <label style={s.label}>
            Batch size (concurrent)
            <input style={s.input} type="number" min={1} max={50}
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))} />
            <span style={s.hint}>Number of requests sent together</span>
          </label>
        </div>

        {/* Progress bar */}
        {isRunning && (
          <div style={s.progressWrap}>
            <div style={{...s.progressBar, width: `${progress}%`}} />
            <span style={s.progressLabel}>{progress}%</span>
          </div>
        )}

        <div style={s.btnRow}>
          <button
            style={{...s.btn, ...s.btnGreen, flex: 1,
              opacity: isRunning ? 0.6 : 1}}
            onClick={runLoadTest}
            disabled={isRunning}>
            {isRunning ? `⏳ Sending... ${progress}%` : `🚀 Start Load Test (${loadCount} tx)`}
          </button>

          {isRunning && (
            <button style={{...s.btn, ...s.btnRed}}
              onClick={() => abortRef.current = true}>
              ⏹ Stop
            </button>
          )}
        </div>

        {/* Results */}
        {result && (
          <div style={s.results}>
            <h3 style={s.resultsTitle}>📊 Results</h3>
            <div style={s.statsGrid}>
              <StatBox label="Sent" value={result.total} color="#94a3b8" />
              <StatBox label="Succeeded" value={result.succeeded} color="#10b981" />
              <StatBox label="Failed"  value={result.failed}    color="#ef4444" />
              <StatBox label="Time"    value={`${result.durationMs}ms`} color="#f59e0b" />
              <StatBox label="tx/sec" value={result.txPerSecond} color="#818cf8" />
            </div>

            {/* Analysis */}
            <div style={s.analysis}>
              {result.failed === 0
                ? '✅ All transactions passed successfully!'
                : `⚠️ ${result.failed} transactions failed — probably overload`}
              {result.txPerSecond > 50
                ? ' 🚀 Excellent performance'
                : result.txPerSecond > 20
                ? ' 👍 Good performance'
                : ' 🐢 Slow performance — try reducing Batch size'}
            </div>
          </div>
        )}
      </div>

      {/* Manual form */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>✍️ Manual Entry</h2>
        <div style={s.formGrid}>
          <label style={s.label}>
            Transaction ID
            <input style={s.input} value={form.transactionId || ''}
              onChange={e => setForm(f => ({...f, transactionId: e.target.value}))} />
          </label>
          <label style={s.label}>
            Amount
            <input style={s.input} type="number" step="0.01" value={form.amount || ''}
              onChange={e => setForm(f => ({...f, amount: parseFloat(e.target.value)}))} />
          </label>
          <label style={s.label}>
            Currency
            <select style={s.input} value={form.currency || 'USD'}
              onChange={e => setForm(f => ({...f, currency: e.target.value}))}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label style={s.label}>
            Status
            <select style={s.input} value={form.status || 'Completed'}
              onChange={e => setForm(f => ({...f, status: e.target.value as TransactionStatus}))}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <button style={{...s.btn, ...s.btnBlue, width: '100%', marginTop: '1rem'}}
          onClick={async () => {
            const ok = await sendOne(form as Transaction);
            setSingleStatus(ok ? 'ok' : 'err');
            if (ok) {
              setSentCount(c => c + 1);
              setForm(f => ({...f, transactionId: crypto.randomUUID()}));
            }
          }}>
          📤 Submit
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string|number; color: string }) {
  return (
    <div style={sb.box}>
      <div style={{...sb.val, color}}>{value}</div>
      <div style={sb.lbl}>{label}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container:    { maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' },
  header:       { textAlign: 'center', marginBottom: '2rem' },
  title:        { fontSize: '2rem', fontWeight: 700, color: '#f1f5f9', margin: 0 },
  subtitle:     { color: '#94a3b8', marginTop: '0.5rem' },
  badge:        { display: 'inline-block', background: '#1e40af', color: '#bfdbfe', padding: '0.3rem 1rem', borderRadius: 20, fontSize: '0.85rem', marginTop: '0.5rem' },
  quickRow:     { display: 'flex', gap: '1rem', marginBottom: '1rem' },
  btn:          { padding: '0.75rem 1.5rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', transition: 'opacity 0.2s' },
  btnBlue:      { background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', flex: 1 },
  btnGray:      { background: 'rgba(100,116,139,0.2)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', flex: 1 },
  btnGreen:     { background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff' },
  btnRed:       { background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' },
  alert:        { padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontWeight: 500 },
  alertGreen:   { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' },
  alertRed:     { background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' },
  card:         { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' },
  cardTitle:    { color: '#e2e8f0', marginTop: 0, marginBottom: '0.5rem' },
  cardDesc:     { color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.6 },
  configRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' },
  label:        { display: 'flex', flexDirection: 'column', gap: '0.4rem', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 },
  input:        { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '0.6rem 0.8rem', color: '#f1f5f9', fontSize: '0.95rem', outline: 'none' },
  hint:         { color: '#475569', fontSize: '0.75rem', fontWeight: 400 },
  progressWrap: { background: 'rgba(255,255,255,0.05)', borderRadius: 8, height: 24, position: 'relative', marginBottom: '1rem', overflow: 'hidden' },
  progressBar:  { position: 'absolute', left: 0, top: 0, height: '100%', background: 'linear-gradient(90deg,#3b82f6,#10b981)', transition: 'width 0.2s', borderRadius: 8 },
  progressLabel:{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#f1f5f9', fontSize: '0.8rem', fontWeight: 600 },
  btnRow:       { display: 'flex', gap: '0.75rem' },
  results:      { marginTop: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: 8 },
  resultsTitle: { color: '#e2e8f0', margin: '0 0 1rem' },
  statsGrid:    { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.5rem', marginBottom: '1rem' },
  analysis:     { color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 },
  formGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
};

const sb: Record<string, React.CSSProperties> = {
  box: { background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.75rem', textAlign: 'center' },
  val: { fontSize: '1.3rem', fontWeight: 700 },
  lbl: { color: '#64748b', fontSize: '0.7rem', marginTop: '0.2rem', textTransform: 'uppercase' },
};
