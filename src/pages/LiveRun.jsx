import { useState } from 'react';
import { useFetch } from '@/hooks/useFetch';
import { sdk } from '@/services/sdk';
import ApperIcon from '@/components/ApperIcon';

export const route = { path: '/live-run', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'Route', label: 'Live run', section: 'Shift', order: 2 };
const FIELDS = ['Name','platform_c','orderCode_c','phase_c','pickup_c','dropAddress_c','earning_c','distanceKm_c','notes_c'];
const phases = ['Accepted','To Pickup','Arrived Pickup','Picked Up','To Drop','Delivered'];

export default function LiveRun() {
  const { data, loading, error, run, setData } = useFetch(async () => {
    const r = await sdk.table('orders_c').select(FIELDS).orderByDesc('CreatedOn').page(1, 100).fetch();
    if (!r.success) throw new Error(r.message);
    return r.data ?? [];
  }, []);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const active = (data ?? []).filter(o => !['Delivered','Cancelled'].includes(o.phase_c));
  async function advance(order) {
    const idx = phases.indexOf(order.phase_c);
    if (idx < 0 || idx >= phases.length - 1) return;
    const next = phases[idx + 1];
    setBusy(order.Id); setNotice('');
    const before = data;
    setData((data ?? []).map(o => o.Id === order.Id ? { ...o, phase_c: next } : o));
    try {
      const res = await sdk.table('orders_c').update({ Id: order.Id, phase_c: next });
      if (!res.success) { setData(before); setNotice(res.messages?.[0] || res.message || 'Could not update order.'); }
      else { setNotice(`${order.orderCode_c || order.Name}: ${next}`); await run(); }
    } catch (e) { setData(before); setNotice(e.message || 'Could not update order.'); }
    finally { setBusy(''); }
  }
  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">Multi-platform workflow</p><h1 className="font-heading text-5xl font-bold">Live run</h1><p className="mt-2 text-muted-foreground">Move each order through its own journey. Keep overlapping platform jobs visible.</p></div><div className="rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground"><strong className="font-heading text-3xl">{active.length}</strong><span className="ml-2 text-sm">active orders</span></div></header>
    <div className="rounded-2xl border border-warning-border bg-warning-muted p-4 text-sm text-warning-foreground"><strong>GPS capture status:</strong> This web preview cannot run a native Android background location service. Milestone GPS logging requires the Android build and location permission; use the manual phase controls here to test the workflow.</div>
    {notice && <div role="status" className="rounded-xl bg-success-muted p-3 text-sm text-success">{notice}</div>}
    {loading ? <div className="grid gap-4 md:grid-cols-2">{[1,2].map(i=><div key={i} className="h-64 animate-pulse rounded-3xl bg-muted"/>)}</div> : error ? <div className="rounded-xl bg-destructive/10 p-4 text-destructive">{error.message}<button onClick={run} className="ml-3 underline">Retry</button></div> : active.length === 0 ? <div className="rounded-3xl border border-dashed border-border p-10 text-center"><ApperIcon name="Route" className="mx-auto mb-3 text-muted-foreground"/><h2 className="font-heading text-3xl font-bold">No open deliveries</h2><p className="mt-2 text-muted-foreground">Add an order from Order History when you accept a job.</p></div> : <div className="grid gap-5 xl:grid-cols-2">{active.map(order => { const idx = phases.indexOf(order.phase_c); return <article key={order.Id} className="rounded-3xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><span className="mb-2 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">{order.platform_c?.Name || 'Platform'}</span><h2 className="font-heading text-3xl font-bold">{order.orderCode_c || order.Name}</h2><p className="text-sm text-muted-foreground">Pickup: {order.pickup_c?.Name || 'Not set'}</p></div><strong className="text-lg">₹{Number(order.earning_c || 0).toFixed(0)}</strong></div>
      <div className="mb-6 space-y-3">{phases.map((phase, i) => <div key={phase} className="flex items-center gap-3"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i < idx ? 'bg-success text-success-foreground' : i === idx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{i < idx ? <ApperIcon name="Check" size="xs"/> : i+1}</span><span className={`text-sm ${i === idx ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{phase}</span>{i === idx && <span className="ml-auto text-xs font-bold text-primary">CURRENT</span>}</div>)}</div>
      <div className="mb-4 rounded-xl bg-muted/60 p-3 text-sm"><span className="text-muted-foreground">Drop-off</span><p className="font-semibold">{order.dropAddress_c || 'Add destination in order details'}</p></div>
      <button disabled={busy === order.Id || idx >= phases.length-1} onClick={() => advance(order)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">{busy === order.Id ? 'Saving phase…' : idx === phases.length-2 ? 'Mark delivered' : `Advance to ${phases[idx+1]}`}<ApperIcon name="ArrowRight"/></button>
    </article>; })}</div>}</div>;
}
