import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import ApperIcon from '@/components/ApperIcon';
import { useLocalQuery } from '@/hooks/useLocalTable';
import { useFunction } from '@/hooks/useFunction';
import { insert, query, update } from '@/services/localDb';

const SLICE_KEY = 'rideros.slice.account';

export const route = { path: '/live-run', layout: 'owner', access: 'public' };
export const nav = { icon: 'Route', label: 'Live run', section: 'Operations', order: 2 };

const PHASES = ['Allocated', 'En Route Pickup', 'Arrived Pickup', 'Picked Up', 'En Route Customer', 'Arrived Customer', 'Delivered'];
const TRACKING_INTERVAL_MS = 30000;

export default function LiveRun() {
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [trackingState, setTrackingState] = useState({ active: false, lastCapturedAt: null, error: '' });
  const [paymentNotice, setPaymentNotice] = useState('');
  const [upiPayload, setUpiPayload] = useState(null);
  const trackingOrderRef = useRef(null);
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
  const { data: paymentRows, run: runPayments } = useLocalQuery('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC', [current?.id ?? ''], [current?.id]);
  const currentPayment = paymentRows?.[0];

  useEffect(() => {
    trackingOrderRef.current = current?.id ?? null;
  }, [current?.id]);

  useEffect(() => {
    if (!current) {
      setTrackingState({ active: false, lastCapturedAt: null, error: '' });
      return undefined;
    }

    let cancelled = false;
    let timer;

    async function captureTrackingPoint() {
      try {
        const location = await captureLocation();
        const capturedAt = new Date().toISOString();
        const orderId = trackingOrderRef.current;
        if (!orderId || cancelled) return;
        await insert('gps_events', {
          order_id: orderId,
          trip_id: null,
          event_type: 'tracking',
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy_m: location.accuracy,
          captured_at: capturedAt,
          source: location.source
        }, 'gps');
        const distance = await calculateOrderDistance(orderId);
        await update('orders', orderId, { distance_km: Number(distance.toFixed(3)) });
        if (!cancelled) {
          setTrackingState({ active: true, lastCapturedAt: capturedAt, error: '' });
          await run();
        }
      } catch (err) {
        if (!cancelled) setTrackingState(state => ({ ...state, active: false, error: err.message || 'GPS tracking is unavailable.' }));
      }
    }

    captureTrackingPoint();
    timer = window.setInterval(captureTrackingPoint, TRACKING_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [current?.id]);

  async function advance(order) {
    const index = PHASES.indexOf(order.status);
    if (index < 0 || index >= PHASES.length - 1) return;
    await transition(order, PHASES[index + 1]);
  }

  async function transition(order, nextStatus) {
    setBusy(order.id);
    setNotice('');
    try {
      if (nextStatus === 'Delivered' && order.payment_type === 'COD') {
        const payment = (await query('SELECT status FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1', [order.id]))[0];
        if (!payment || payment.status !== 'PAID') {
          setPaymentNotice(`Collect ₹${Number(order.cod_amount || 0).toFixed(2)} before marking ${order.code} delivered.`);
          return;
        }
      }
      const location = await captureLocation();
      const capturedAt = new Date().toISOString();
      const eventType = {
        'En Route Pickup': 'en_route_pickup',
        'Arrived Pickup': 'arrived_pickup',
        'Picked Up': 'picked_up',
        'En Route Customer': 'en_route_customer',
        'Arrived Customer': 'arrived_customer',
        Delivered: 'delivered'
      }[nextStatus] || 'milestone';
      await insert('gps_events', {
        order_id: order.id,
        trip_id: null,
        event_type: eventType,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
        captured_at: capturedAt,
        source: location.source
      }, 'gps');

      const fields = { status: nextStatus };
      if (nextStatus === 'Arrived Pickup') fields.arrived_pickup_at = capturedAt;
      if (nextStatus === 'Picked Up') fields.picked_up_at = capturedAt;
      if (nextStatus === 'Arrived Customer') {
        fields.arrived_customer_at = capturedAt;
        fields.drop_latitude = location.latitude;
        fields.drop_longitude = location.longitude;
      }
      if (nextStatus === 'Delivered') {
        fields.delivered_at = capturedAt;
        fields.drop_latitude = location.latitude;
        fields.drop_longitude = location.longitude;
        fields.duration_min = Number(((new Date(capturedAt) - new Date(order.accepted_at)) / 60000).toFixed(2));
        fields.distance_km = Number((await calculateOrderDistance(order.id)).toFixed(3));
      }
      await update('orders', order.id, fields);
      setNotice(`${order.code}: ${nextStatus}. GPS milestone saved.`);
      await run();
    } catch (err) {
      setNotice(err.message || 'Could not capture the milestone.');
    } finally {
      setBusy('');
    }
  }

  async function collectCash(order) {
    if (order.payment_type !== 'COD') return;
    const amount = Number(order.cod_amount || 0);
    if (!amount) return setPaymentNotice('COD amount is missing on this order.');
    await insert('payments', { order_id: order.id, amount, method: 'cash', status: 'PAID', paid_at: new Date().toISOString(), notes: 'Cash collected by rider' }, 'pay');
    setPaymentNotice(`Cash ₹${amount.toFixed(2)} recorded as collected.`);
    await runPayments();
  }

  function createUpiQr(order) {
    if (order.payment_type !== 'COD') return;
    const amount = Number(order.cod_amount || 0);
    if (!amount) return setPaymentNotice('COD amount is missing on this order.');
    const stored = localStorage.getItem(SLICE_KEY);
    const account = stored ? JSON.parse(stored) : null;
    if (!account?.vpa) {
      setPaymentNotice('Add your Slice UPI ID in Settings before collecting COD by UPI.');
      return;
    }
    const paymentUri = `upi://pay?${new URLSearchParams({ pa: account.vpa, pn: account.payee || 'Delivery', am: amount.toFixed(2), cu: 'INR', tn: `COD ${order.code}` }).toString()}`;
    setUpiPayload({ paymentUri, amount, vpa: account.vpa, payee: account.payee || 'Delivery' });
    setPaymentNotice(`QR ready for ₹${amount.toFixed(2)}. Confirm the payment in Slice before marking the amount received.`);
  }

  async function confirmUpiPaid(order) {
    const amount = Number(order.cod_amount || 0);
    const reference = window.prompt('Enter the UPI transaction / UTR reference (optional). Leave blank if you only want to mark the amount received.');
    await insert('payments', { order_id: order.id, amount, method: 'upi', status: 'PAID', upi_reference: reference?.trim() || null, paid_at: new Date().toISOString(), notes: 'UPI payment received and confirmed by rider' }, 'pay');
    setUpiPayload(null);
    setPaymentNotice(`UPI ₹${amount.toFixed(2)} marked as received.`);
    await runPayments();
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">Live operations</p><h1 className="font-heading text-5xl font-bold">Live run</h1><p className="mt-2 text-muted-foreground">Follow the delivery in order. Rider GPS is captured at milestones and every 30 seconds while an order is active.</p></div><div className="rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground"><strong className="font-heading text-3xl">{active.length}</strong><span className="ml-2 text-sm">open orders</span></div></header>
    <section className="grid gap-4 md:grid-cols-[1.2fr_.8fr]">
      <div className="rounded-3xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground"><ApperIcon name="MapPinned" /></span><div><h2 className="font-heading text-2xl font-bold">Live GPS tracking</h2><p className="text-sm text-muted-foreground">The app records a route point immediately, then every 30 seconds while the active delivery is open.</p></div></div><div className="grid gap-3 sm:grid-cols-3"><Info title="Tracking" text={trackingState.active ? `Last point ${formatElapsedSince(trackingState.lastCapturedAt)}` : trackingState.error || 'Waiting for GPS permission'} /><Info title="Distance" text={current ? `${Number(current.distance_km || 0).toFixed(2)} km recorded` : 'No active order'} /><Info title="Allocation timer" text={current ? `${formatDuration((Date.now() - new Date(current.accepted_at).getTime()) / 60000)} since allocation` : 'No active order'} /></div></div>
      <div className="rounded-3xl border border-border bg-muted p-5"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Current focus</p><h2 className="mt-2 font-heading text-3xl font-bold">{current?.code ?? 'No active order'}</h2><p className="mt-1 text-sm text-muted-foreground">{current ? `${current.platform_name || 'Platform'} · ${current.status}` : 'Add an order to begin a run.'}</p></div>
    </section>
    {notice && <div role="status" className="rounded-xl bg-muted p-3 text-sm">{notice}</div>}
    {current?.payment_type === 'COD' && <section className="rounded-3xl border border-border bg-card p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-primary">COD collection</p><h2 className="mt-1 font-heading text-3xl font-bold">Collect ₹{Number(current.cod_amount || 0).toFixed(2)}</h2><p className="mt-1 text-sm text-muted-foreground">Record the payment before completing delivery.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${currentPayment?.status === 'PAID' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{currentPayment?.status === 'PAID' ? 'PAID' : 'PAYMENT DUE'}</span></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><button onClick={() => collectCash(current)} disabled={currentPayment?.status === 'PAID'} className="rounded-xl bg-foreground px-4 py-3 font-bold text-background disabled:opacity-50"><ApperIcon name="Banknote" className="mr-2 inline h-4 w-4" />Collect cash</button><button onClick={() => createUpiQr(current)} disabled={currentPayment?.status === 'PAID'} className="rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50"><ApperIcon name="QrCode" className="mr-2 inline h-4 w-4" />Show Slice QR</button><button onClick={() => confirmUpiPaid(current)} disabled={currentPayment?.status === 'PAID'} className="rounded-xl border border-border px-4 py-3 font-bold disabled:opacity-50">Mark amount received</button></div>{upiPayload && <div className="mt-4 grid gap-4 rounded-2xl bg-muted p-4 sm:grid-cols-[auto_1fr] sm:items-center"><div className="rounded-2xl bg-background p-4"><QRCodeCanvas value={upiPayload.paymentUri} size={220} includeMargin /></div><div><p className="text-sm font-bold">Scan to pay ₹{Number(upiPayload.amount).toFixed(2)}</p><p className="mt-1 text-xs text-muted-foreground">{upiPayload.payee} · {upiPayload.vpa}</p><p className="mt-3 text-xs leading-relaxed text-muted-foreground">After the customer pays, verify the successful credit in the Slice app. Then tap “Mark amount received”. Delivery remains blocked until a PAID payment record exists.</p><button onClick={() => navigator.clipboard?.writeText(upiPayload.paymentUri)} className="mt-3 rounded-xl bg-background px-3 py-2 text-xs font-bold">Copy UPI payment link</button></div></div>}{paymentNotice && <p className="mt-3 text-sm font-semibold text-muted-foreground">{paymentNotice}</p>}</section>}
    {loading ? <div className="grid gap-5 xl:grid-cols-2">{[1, 2].map(item => <div key={item} className="h-80 animate-pulse rounded-3xl bg-muted" />)}</div> : error ? <div className="rounded-2xl bg-destructive/10 p-5 text-destructive">{error.message}<button onClick={run} className="ml-3 underline">Retry</button></div> : active.length === 0 ? <div className="grid justify-items-center rounded-3xl border border-dashed border-border p-10 text-center"><ApperIcon name="Route" className="mb-3 text-muted-foreground" /><h2 className="font-heading text-3xl font-bold">Run is clear</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">There are no open deliveries. Add an order, then return here to capture its journey.</p></div> : <div className="grid gap-5 xl:grid-cols-2">{active.map(order => <RunCard key={order.id} order={order} busy={busy === order.id} onAdvance={advance} />)}</div>}
  </div>;
}

function RunCard({ order, busy, onAdvance }) {
  const index = PHASES.indexOf(order.status);
  const next = PHASES[index + 1];
  const actionLabels = {
    'En Route Pickup': 'Start pickup trip',
    'Arrived Pickup': 'Mark arrived at pickup',
    'Picked Up': 'Mark picked up',
    'En Route Customer': 'Start customer trip',
    'Arrived Customer': 'Mark arrived at customer',
    Delivered: 'Mark delivered'
  };
  const elapsed = order.delivered_at
    ? Number(order.duration_min || 0)
    : (Date.now() - new Date(order.accepted_at).getTime()) / 60000;

  return <article className="rounded-3xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div className="min-w-0"><span className="mb-2 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">{order.platform_name || 'Platform'}</span><h2 className="font-heading text-3xl font-bold">{order.code}</h2><p className="text-sm text-muted-foreground">Pickup: {order.pickup_name || order.pickup_address || 'Not assigned'}</p><p className="truncate text-sm text-muted-foreground" title={order.drop_address || ''}>Customer: {order.drop_address || 'No destination saved'}</p></div><strong className="shrink-0 text-lg tabular-nums">₹{Number(order.earning || 0).toFixed(0)}</strong></div><div className="mb-5 grid gap-3 sm:grid-cols-3"><MiniMetric label="Distance" value={`${Number(order.distance_km || 0).toFixed(2)} km`} /><MiniMetric label="Run time" value={formatDuration(elapsed)} /><MiniMetric label="Payment" value={order.payment_type === 'COD' ? `COD ₹${Number(order.cod_amount || 0).toFixed(0)}` : 'Prepaid'} /></div><div className="mb-6 space-y-2">{PHASES.map((phase, step) => <div key={phase} className="flex items-center gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${step < index ? 'bg-success text-success-foreground' : step === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{step < index ? <ApperIcon name="Check" /> : step + 1}</span><span className={step === index ? 'font-bold' : 'text-sm text-muted-foreground'}>{phase}</span>{step === index && <span className="ml-auto text-xs font-bold text-primary">CURRENT</span>}</div>)}</div><div className="rounded-2xl bg-muted p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next rider action</p><p className="mt-1 text-sm font-semibold">{actionLabels[next] || 'Delivery complete'}</p><button disabled={busy || !next} onClick={() => onAdvance(order)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:opacity-50">{busy ? 'Saving GPS…' : actionLabels[next] || 'Delivered'}<ApperIcon name="MapPin" /></button>{next === 'Delivered' && order.payment_type === 'COD' && <p className="mt-2 text-center text-xs font-semibold text-destructive">COD payment must be recorded before delivery.</p>}</div></article>;
}

function Info({ title, text }) { return <div className="rounded-2xl bg-muted p-4"><strong className="text-sm">{title}</strong><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p></div>; }
function MiniMetric({ label, value }) { return <div className="rounded-xl border border-border bg-background p-3"><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-sm tabular-nums">{value}</strong></div>; }
function formatDuration(minutes) { const total = Math.max(0, Math.round(Number(minutes) || 0)); const hours = Math.floor(total / 60); const mins = total % 60; return hours ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${mins}m`; }
function formatElapsedSince(iso) { if (!iso) return 'waiting'; return formatDuration((Date.now() - new Date(iso).getTime()) / 60000) + ' ago'; }

async function calculateOrderDistance(orderId) {
  const points = await query('SELECT latitude, longitude FROM gps_events WHERE order_id = ? ORDER BY captured_at ASC', [orderId]);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineKm(Number(points[index - 1].latitude), Number(points[index - 1].longitude), Number(points[index].latitude), Number(points[index].longitude));
  }
  return total;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function captureLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error('This device does not expose GPS location.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, source: 'browser-geolocation' }),
    error => reject(new Error(error.code === 1 ? 'Location permission was denied. Enable location access and try again.' : 'Could not read the current GPS position.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  ));
}
