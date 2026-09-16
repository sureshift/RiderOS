import { useMemo } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ApperIcon from '@/components/ApperIcon';
import { useLocalQuery } from '@/hooks/useLocalTable';

export const route = { path: '/insights', layout: 'owner', access: 'public' };
export const nav = { icon: 'ChartNoAxesCombined', label: 'Insights', section: 'Operations', order: 6 };

export default function Insights() {
  const { data: orders, loading: ordersLoading, error: ordersError, run: reloadOrders } = useLocalQuery('SELECT * FROM orders ORDER BY created_at DESC', [], []);
  const { data: events, loading: eventsLoading, error: eventsError, run: reloadEvents } = useLocalQuery('SELECT * FROM gps_events ORDER BY captured_at DESC', [], []);
  const delivered = (orders ?? []).filter(order => order.status === 'Delivered');
  const earnings = delivered.reduce((sum, order) => sum + Number(order.earning || 0), 0);
  const distance = delivered.reduce((sum, order) => sum + Number(order.distance_km || 0), 0);
  const duration = delivered.reduce((sum, order) => sum + Number(order.duration_min || 0), 0);
  const gps = (events ?? []).filter(event => Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude)));
  const center = useMemo(() => gps.length ? [Number(gps[0].latitude), Number(gps[0].longitude)] : [28.6139, 77.2090], [gps]);
  const platformTotals = {};
  delivered.forEach(order => { const key = order.platform_id || 'Unassigned'; platformTotals[key] = (platformTotals[key] || 0) + Number(order.earning || 0); });
  const maxPlatform = Math.max(1, ...Object.values(platformTotals));
  const error = ordersError || eventsError;

  return <div className="space-y-6"><header><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">Your operational memory</p><h1 className="font-heading text-5xl font-bold">Shift intelligence</h1><p className="mt-2 text-muted-foreground">Every metric below is calculated from your local SQLite records.</p></header>
    {ordersLoading || eventsLoading ? <Loading /> : error ? <div className="rounded-2xl bg-destructive/10 p-5 text-destructive">{error.message}<button onClick={() => { reloadOrders(); reloadEvents(); }} className="ml-3 underline">Retry</button></div> : <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Delivered earnings" value={`₹${earnings.toFixed(0)}`} icon="IndianRupee" /><Stat label="Distance recorded" value={`${distance.toFixed(1)} km`} icon="Route" /><Stat label="Delivery duration" value={`${duration.toFixed(0)} min`} icon="Clock" /><Stat label="GPS milestones" value={gps.length} icon="MapPin" /></section>
      <section className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]"><div className="rounded-3xl border border-border bg-card p-6"><h2 className="font-heading text-3xl font-bold">Earnings by platform</h2><p className="mb-6 text-sm text-muted-foreground">Completed orders only</p>{Object.keys(platformTotals).length === 0 ? <p className="text-sm text-muted-foreground">Complete orders to see platform totals.</p> : <div className="space-y-5">{Object.entries(platformTotals).sort((a, b) => b[1] - a[1]).map(([platform, value]) => <div key={platform}><div className="mb-2 flex justify-between"><strong>{platform}</strong><span className="font-bold tabular-nums">₹{value.toFixed(0)}</span></div><div className="h-3 rounded-full bg-muted"><div className="h-3 rounded-full bg-primary" style={{ width: `${value / maxPlatform * 100}%` }} /></div></div>)}</div>}</div>
        <div className="rounded-3xl border border-border bg-card p-6"><h2 className="font-heading text-3xl font-bold">Operational signals</h2><div className="mt-5 space-y-3"><Signal icon="Gauge" title={`${delivered.length} completed deliveries`} text="Build a larger sample before treating performance patterns as stable." /><Signal icon="IndianRupee" title={`₹${(duration ? earnings / (duration / 60) : 0).toFixed(0)} per recorded hour`} text="Uses delivery durations entered on completed orders; it does not estimate unpaid online time." /><Signal icon="MapPinned" title={`${gps.length} location points`} text="The map below shows the actual coordinates you captured during milestones." /></div></div></section>
      <section className="overflow-hidden rounded-3xl border border-border bg-card"><div className="flex flex-wrap items-end justify-between gap-3 p-6"><div><h2 className="font-heading text-3xl font-bold">GPS activity map</h2><p className="text-sm text-muted-foreground">OpenStreetMap tiles with your locally captured milestone points</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">{gps.length} points</span></div>{gps.length === 0 ? <div className="grid min-h-72 place-items-center border-t border-border p-8 text-center"><div><ApperIcon name="Map" className="mx-auto mb-3 text-muted-foreground" /><p className="text-sm text-muted-foreground">No GPS points yet. Open Live Run and advance an order while location access is enabled.</p></div></div> : <div className="h-[480px] border-t border-border"><MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{gps.map((point, index) => <CircleMarker key={point.id} center={[Number(point.latitude), Number(point.longitude)]} radius={Math.min(18, 7 + Number(point.accuracy_m || 0) / 25)} pathOptions={{ className: 'gps-point' }}><Tooltip>{point.event_type} · ±{point.accuracy_m ? `${Math.round(point.accuracy_m)} m` : 'unknown accuracy'}</Tooltip></CircleMarker>)}</MapContainer></div>}</section>
    </>}
  </div>;
}

function Stat({ label, value, icon }) { return <div className="rounded-3xl border border-border bg-card p-5"><div className="mb-4 flex justify-between text-muted-foreground"><span className="text-sm font-semibold">{label}</span><ApperIcon name={icon} className="text-primary" /></div><strong className="font-heading text-4xl tabular-nums">{value}</strong></div>; }
function Signal({ icon, title, text }) { return <div className="flex gap-3 rounded-2xl bg-muted/60 p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ApperIcon name={icon} /></span><div><strong>{title}</strong><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div></div>; }
function Loading() { return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <div key={item} className="h-32 animate-pulse rounded-3xl bg-muted" />)}</div>; }
