import { useMemo, useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { useLocalQuery } from '@/hooks/useLocalTable';
import { insert, update } from '@/services/localDb';

export const route = { path: '/live-run', layout: 'owner', access: 'public' };
export const nav = { icon: 'Route', label: 'Live run', section: 'Operations', order: 2 };

const PHASES = ['Accepted', 'To Pickup', 'Arrived Pickup', 'Picked Up', 'To Drop', 'Delivered'];

export default function LiveRun() {
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const { data: orders, loading, error, run } = useLocalQuery(
    `SELECT o.*, p.name AS platform_name, pl.name AS pickup_name
     FROM orders o
     LEFT JOIN platforms p ON p.id = o.platform_id
     LEFT JOIN places pl ON pl.id = o.pickup_place_id
     WHERE o.status NOT IN ('Delivered','Cancelled')
     ORDER BY o.created_at ASC`,
    [],
    []
  );
  const active = orders ?? [];
  const current = useMemo(() => active.find(order => order.status !== 'Issue'), [active]);

  async function advance(order) {
    const index = PHASES.indexOf(order.status);
    if (index < 0 || index >= PHASES.length - 1) return;
    const next = PHASES[index + 1];
    await transition(order, next);
  }

  async function transition(order, nextStatus) {
    setBusy(order.id);
    setNotice('');
    try {
      const location = await captureLocation();
      const eventType = nextStatus === 'Arrived Pickup' ? 'arrived_pickup' : nextStatus === 'Picked Up' ? 'pickup' : nextStatus === 'Delivered' ? 'drop' : 'status';
      await insert('gps_events', {
        order_id: order.id,
        trip_id: null,
        event_type: eventType,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
        captured_at: new Date().toISOString(),
        source: location.source
      }, 'gps');
      const fields = { status: nextStatus };
      if (nextStatus === 'Picked Up') fields.picked_up_at = new Date().toISOString();
      if (nextStatus === 'Delivered') fields.delivered_at = new Date().toISOString();
      await update('orders', order.id, fields);
      setNotice(`${order.code}: ${nextStatus}. GPS point saved.`);
      await run();
    } catch (err) {
      setNotice(err.message || 'Could not capture the milestone.');
    } finally {
      setBusy('');
    }
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">Live operations</p><h1 className="font-heading text-5xl font-bold">Live run</h1><p className="mt-2 text-muted-foreground">Advance deliveries and capture a real GPS event at every important milestone.</p></div><div className="rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground"><strong className="font-heading text-3xl">{active.length}</strong><span className="ml-2 text-sm">open orders</span></div></header>
    <section className="grid gap-4 md:grid-cols-[1.2fr_.8fr]">
      <div className="rounded-3xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground"><ApperIcon name="MapPinned" /></span><div><h2 className="font-heading text-2xl font-bold">Milestone GPS</h2><p className="text-sm text-muted-foreground">Location is requested only when you advance a delivery.</p></div></div><div className="grid gap-3 sm:grid-cols-3"><Info title="Accept" text="Order becomes active" /><Info title="Pickup" text="Arrival and pickup points" /><Info title="Drop" text="Final delivery point" /></div></div>
      <div className="rounded-3xl border border-border bg-muted p-5"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Current focus</p><h2 className="mt-2 font-heading text-3xl font-bold">{current?.code ?? 'No active order'}</h2><p className="mt-1 text-sm text-muted-foreground">{current ? `${current.platform_name || 'Platform'} · ${current.status}` : 'Add an order to begin a run.'}</p></div>
    </section>
    {notice && <div role="status" className="rounded-xl bg-muted p-3 text-sm">{notice}</div>}
    {loading ? <div className="grid gap-5 xl:grid-cols-2">{[1, 2].map(item => <div key={item} className="h-80 animate-pulse rounded-3xl bg-muted" />)}</div> : error ? <div className="rounded-2xl bg-destructive/10 p-5 text-destructive">{error.message}<button onClick={run} className="ml-3 underline">Retry</button></div> : active.length === 0 ? <div className="grid justify-items-center rounded-3xl border border-dashed border-border p-10 text-center"><ApperIcon name="Route" className="mb-3 text-muted-foreground" /><h2 className="font-heading text-3xl font-bold">Run is clear</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">There are no open deliveries. Add an order, then return here to capture its journey.</p></div> : <div className="grid gap-5 xl:grid-cols-2">{active.map(order => <RunCard key={order.id} order={order} busy={busy === order.id} onAdvance={advance} onSetStatus={transition} />)}</div>}
  </div>;
}

function RunCard({ order, busy, onAdvance, onSetStatus }) {
  const index = PHASES.indexOf(order.status);
  return <article className="rounded-3xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><span className="mb-2 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">{order.platform_name || 'Platform'}</span><h2 className="font-heading text-3xl font-bold">{order.code}</h2><p className="text-sm text-muted-foreground">{order.drop_address || 'No destination saved'}</p></div><strong className="text-lg tabular-nums">₹{Number(order.earning || 0).toFixed(0)}</strong></div><div className="mb-6 space-y-2">{PHASES.map((phase, step) => <div key={phase} className="flex items-center gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${step < index ? 'bg-success text-success-foreground' : step === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{step < index ? <ApperIcon name="Check" /> : step + 1}</span><span className={step === index ? 'font-bold' : 'text-sm text-muted-foreground'}>{phase}</span>{step === index && <span className="ml-auto text-xs font-bold text-primary">CURRENT</span>}</div>)}</div><div className="grid gap-2 sm:grid-cols-2"><button disabled={busy || index >= PHASES.length - 1} onClick={() => onAdvance(order)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{busy ? 'Capturing GPS…' : index === PHASES.length - 2 ? 'Capture drop & deliver' : `Capture ${PHASES[index + 1]}`}<ApperIcon name="MapPin" /></button><select value={order.status} disabled={busy} onChange={event => onSetStatus(order, event.target.value)} className="rounded-xl border border-input bg-background px-3 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{PHASES.map(phase => <option key={phase}>{phase}</option>)}</select></div></article>;
}

function Info({ title, text }) { return <div className="rounded-2xl bg-muted p-4"><strong className="text-sm">{title}</strong><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p></div>; }

function captureLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error('This device does not expose GPS location.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, source: 'browser-geolocation' }),
    error => reject(new Error(error.code === 1 ? 'Location permission was denied. Enable location access and try again.' : 'Could not read the current GPS position.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  ));
}
