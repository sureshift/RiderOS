import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { useLocalQuery } from '@/hooks/useLocalTable';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export const route = { path: '/dashboard', layout: 'owner', access: 'public' };
export const nav = { icon: 'Gauge', label: 'Cockpit', section: 'Operations', order: 1 };

export default function Dashboard() {
  const { data: orders, loading, error, run } = useLocalQuery('SELECT * FROM orders ORDER BY created_at DESC', [], []);
  const { data: gpsEvents } = useLocalQuery('SELECT order_id, event_type, latitude, longitude, captured_at FROM gps_events WHERE order_id IS NOT NULL ORDER BY captured_at DESC', [], []);
  const { data: goals } = useLocalQuery('SELECT * FROM goals WHERE active = 1 ORDER BY created_at DESC', [], []);
  const active = (orders ?? []).filter(order => !['Delivered', 'Cancelled'].includes(order.status));
  const delivered = (orders ?? []).filter(order => order.status === 'Delivered');
  const earnings = delivered.reduce((sum, order) => sum + Number(order.earning || 0), 0);
  const distance = (orders ?? []).reduce((sum, order) => sum + Number(order.distance_km || 0), 0);
  const avgDeliveryMinutes = delivered.length ? delivered.reduce((sum, order) => sum + Number(order.duration_min || 0), 0) / delivered.length : 0;
  const pickupWaitRows = delivered.filter(order => order.arrived_pickup_at && order.picked_up_at);
  const avgPickupMinutes = pickupWaitRows.length
    ? pickupWaitRows.reduce((sum, order) => sum + elapsedMinutes(order.arrived_pickup_at, order.picked_up_at), 0) / pickupWaitRows.length
    : 0;
  const goalProgress = useMemo(() => {
    const activeGoals = goals ?? [];
    if (!activeGoals.length) return 0;
    return Math.round(activeGoals.reduce((sum, goal) => sum + Math.min(1, Number(goal.saved) / Math.max(1, Number(goal.target))), 0) / activeGoals.length * 100);
  }, [goals]);

  return <div className="space-y-6">
    <section className="flex flex-col justify-between gap-4 border-b border-border pb-5 md:flex-row md:items-end"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-primary">Operations overview</p><h1 className="font-heading text-4xl font-bold tracking-tight md:text-5xl">Good evening. Here is your shift.</h1><p className="mt-1 text-sm text-muted-foreground">Monitor orders, active runs and earnings from one control center.</p></div><Link to="/orders" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Create order <ApperIcon name="Plus" /></Link></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Today's earnings" value={`₹${earnings.toLocaleString('en-IN')}`} detail={`${delivered.length} delivered`} icon="IndianRupee" /><Metric label="Active orders" value={active.length} detail="Need attention or movement" icon="Package" /><Metric label="Distance tracked" value={`${distance.toFixed(1)} km`} detail="GPS route distance" icon="Route" /><Metric label="Avg delivery time" value={formatMinutes(avgDeliveryMinutes)} detail="Allocation → delivery" icon="Clock" /></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Pickup wait" value={formatMinutes(avgPickupMinutes)} detail="Arrival → picked up" icon="Timer" /><Metric label="Earning / km" value={`₹${(distance ? earnings / distance : 0).toFixed(1)}`} detail="Completed delivery route" icon="TrendingUp" /><Metric label="GPS points" value={(gpsEvents ?? []).length} detail="Milestones + 30s tracking" icon="MapPinned" /><Metric label="Goal progress" value={`${goalProgress}%`} detail={`${(goals ?? []).length} active goals`} icon="Target" /></section>
    <DeliveryHeatmap orders={orders ?? []} gpsEvents={gpsEvents ?? []} />
    <section className="grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-heading text-xl font-semibold">Orders requiring attention</h2><p className="text-xs text-muted-foreground">Your current operational queue</p></div><Link to="/orders" className="text-xs font-bold text-primary hover:underline">View all orders</Link></div>{loading ? <Loading /> : error ? <ErrorState message={error.message} retry={run} /> : active.length === 0 ? <Empty icon="PackageOpen" text="No active deliveries. Add an order when you accept your next job." href="/orders" action="Add order" /> : <div className="divide-y divide-border">{active.slice(0, 7).map(order => <div key={order.id} className="grid gap-3 px-5 py-3.5 md:grid-cols-[1.15fr_.9fr_1fr_auto] md:items-center"><div className="min-w-0"><strong className="block truncate text-sm">{order.code}</strong><span className="text-xs text-muted-foreground">{order.platform_name || 'Platform'} · {order.drop_address || 'No destination'}</span></div><Status status={order.status} /><span className="truncate text-xs text-muted-foreground">{order.pickup_address || 'Pickup not entered'}</span><strong className="tabular-nums text-sm">₹{Number(order.earning || 0).toFixed(0)}</strong></div>)}</div>}</div>
      <div className="rounded-2xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="font-heading text-xl font-semibold">Shift shortcuts</h2><p className="text-xs text-muted-foreground">Common actions</p></div><div className="divide-y divide-border"><QuickAction href="/live-run" icon="Radar" title="Open live operations" text="Track current rider movement" /><QuickAction href="/places" icon="MapPinned" title="Manage network" text="Platforms, hubs and stores" /><QuickAction href="/insights" icon="ChartNoAxesCombined" title="Review analytics" text="Earnings and delivery trends" /><QuickAction href="/settings" icon="HardDrive" title="Backup database" text="Export your local SQLite file" /></div></div>
    </section>
    <section className="grid gap-4 xl:grid-cols-[1fr_1fr]"><div className="rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-heading text-xl font-semibold">Money goals</h2><p className="text-xs text-muted-foreground">Progress from completed work</p></div><Link to="/goals" className="text-xs font-bold text-primary hover:underline">Manage</Link></div>{(goals ?? []).length === 0 ? <Empty icon="Target" text="Create a savings target to track progress." href="/goals" action="Create goal" /> : <div className="space-y-4">{(goals ?? []).slice(0, 3).map(goal => { const percent = Math.min(100, Math.round(Number(goal.saved) / Math.max(1, Number(goal.target)) * 100)); return <div key={goal.id}><div className="mb-1.5 flex justify-between gap-3 text-sm"><strong>{goal.name}</strong><span className="font-bold tabular-nums">{percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>₹{Number(goal.saved).toLocaleString('en-IN')}</span><span>₹{Number(goal.target).toLocaleString('en-IN')}</span></div></div>; })}</div>}</div><div className="rounded-2xl border border-border bg-card p-5"><div className="mb-4"><h2 className="font-heading text-xl font-semibold">Local-first status</h2><p className="text-xs text-muted-foreground">How RiderOS stores your operations</p></div><div className="grid gap-3 sm:grid-cols-3"><SystemStat icon="Database" title="SQLite" text="Primary data store" /><SystemStat icon="Map" title="GPS" text="Milestones & routes" /><SystemStat icon="Cloud" title="Backup" text="Optional cloud copy" /></div></div></section>
  </div>;
}

function DeliveryHeatmap({ orders, gpsEvents }) {
  const points = useMemo(() => {
    const gpsByOrder = new Map();
    (gpsEvents ?? []).forEach(event => {
      const lat = Number(event.latitude);
      const lng = Number(event.longitude);
      if (!event.order_id || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return;
      if (!gpsByOrder.has(event.order_id)) gpsByOrder.set(event.order_id, []);
      gpsByOrder.get(event.order_id).push({ lat, lng, type: String(event.event_type || '').toLowerCase() });
    });

    return (orders ?? []).map(order => {
      const lat = Number(order.drop_latitude);
      const lng = Number(order.drop_longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) return { lat, lng, code: order.code };
      const events = gpsByOrder.get(order.id) ?? [];
      const delivery = events.find(point => /drop|deliver/.test(point.type));
      return delivery ? { lat: delivery.lat, lng: delivery.lng, code: order.code } : null;
    }).filter(Boolean);
  }, [orders, gpsEvents]);

  const clusters = useMemo(() => buildHeatClusters(points), [points]);
  const maxCount = Math.max(1, ...clusters.map(cluster => cluster.count));
  const center = useMemo(() => {
    if (!points.length) return null;
    return [points.reduce((sum, point) => sum + point.lat, 0) / points.length, points.reduce((sum, point) => sum + point.lng, 0) / points.length];
  }, [points]);

  return <section className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-primary">Historical demand</p>
        <h2 className="font-heading text-xl font-semibold">Delivery heatmap</h2>
        <p className="mt-1 text-xs text-muted-foreground">Custom density view of the areas that have generated the most recorded deliveries.</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Higher order density</div>
    </div>
    {clusters.length === 0 ? <div className="grid min-h-72 place-items-center bg-muted/30 px-6 py-10 text-center">
      <div><ApperIcon name="Map" className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="text-sm font-semibold">Not enough location history yet</p><p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">The heatmap becomes active as delivered orders or GPS milestones contain latitude and longitude. It never invents demand from an address alone.</p></div>
    </div> : <div className="relative min-h-80 overflow-hidden md:min-h-96">
      <MapContainer center={center} zoom={12} scrollWheelZoom className="h-80 w-full md:h-96">
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <HeatmapViewport points={points} />
        {clusters.map(cluster => <CircleMarker key={`zone-${cluster.lat}-${cluster.lng}`} center={[cluster.lat, cluster.lng]} radius={18 + (cluster.count / maxCount) * 28} pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.14, weight: 1 }}><Tooltip>{cluster.count} order{cluster.count === 1 ? '' : 's'} in this demand zone</Tooltip></CircleMarker>)}
        {clusters.map(cluster => <CircleMarker key={`core-${cluster.lat}-${cluster.lng}`} center={[cluster.lat, cluster.lng]} radius={7 + (cluster.count / maxCount) * 9} pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.42, weight: 0 }} />)}
        {points.map((point, index) => <CircleMarker key={`${point.code}-${index}`} center={[point.lat, point.lng]} radius={4} pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 0.7, weight: 1 }}><Tooltip>{point.code}</Tooltip></CircleMarker>)}
      </MapContainer>
      <div className="absolute bottom-4 left-4 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-(--shadow-sm)"><p className="text-xs font-semibold">{points.length} geolocated deliveries</p><p className="text-[11px] text-muted-foreground">{clusters.length} demand zones · peak {maxCount} orders</p></div>
      <div className="absolute right-4 top-4 rounded-xl border border-border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-(--shadow-sm)"><span>Low</span><span className="mx-2 inline-block h-1.5 w-16 rounded-full bg-red-200 align-middle" /><span className="font-bold text-red-600">Peak</span></div>
    </div>}
  </section>;
}

function HeatmapViewport({ points }) {
  const map = useMap();
  useMemo(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
      return;
    }
    map.fitBounds(points.map(point => [point.lat, point.lng]), { padding: [32, 32], maxZoom: 14 });
  }, [map, points]);
  return null;
}

function buildHeatClusters(points) {
  if (!points.length) return [];
  const minLat = Math.min(...points.map(point => point.lat));
  const maxLat = Math.max(...points.map(point => point.lat));
  const minLng = Math.min(...points.map(point => point.lng));
  const maxLng = Math.max(...points.map(point => point.lng));
  const latSpan = Math.max(maxLat - minLat, 0.002);
  const lngSpan = Math.max(maxLng - minLng, 0.002);
  const buckets = new Map();

  points.forEach(point => {
    const gx = Math.max(0, Math.min(7, Math.floor(((point.lng - minLng) / lngSpan) * 8)));
    const gy = Math.max(0, Math.min(5, Math.floor(((maxLat - point.lat) / latSpan) * 6)));
    const key = `${gx}-${gy}`;
    const bucket = buckets.get(key) ?? { gx, gy, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);
  });

  return Array.from(buckets.values()).map(bucket => ({
    count: bucket.count,
    lat: maxLat - ((bucket.gy + 0.5) / 6) * latSpan,
    lng: minLng + ((bucket.gx + 0.5) / 8) * lngSpan
  }));
}

function Metric({ label, value, detail, icon }) { return <div className="rounded-2xl border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span><ApperIcon name={icon} className="h-4 w-4 text-primary" /></div><div className="font-heading text-3xl font-bold tabular-nums">{value}</div><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function elapsedMinutes(start, end) { return Math.max(0, (new Date(end) - new Date(start)) / 60000); }
function formatMinutes(minutes) { const total = Math.round(Number(minutes) || 0); const hours = Math.floor(total / 60); const mins = total % 60; return hours ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${mins}m`; }
function Status({ status }) { return <span className="inline-flex w-fit items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{status}</span>; }
function QuickAction({ href, icon, title, text }) { return <Link to={href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><ApperIcon name={icon} className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className="text-xs text-muted-foreground">{text}</span></span><ApperIcon name="ChevronRight" className="h-4 w-4 text-muted-foreground" /></Link>; }
function SystemStat({ icon, title, text }) { return <div className="rounded-xl bg-muted p-3"><ApperIcon name={icon} className="mb-2 h-4 w-4 text-primary" /><strong className="block text-sm">{title}</strong><span className="text-xs text-muted-foreground">{text}</span></div>; }
function Loading() { return <div className="space-y-3">{[1, 2, 3].map(item => <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>; }
function ErrorState({ message, retry }) { return <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{message}<button onClick={retry} className="ml-3 underline">Retry</button></div>; }
function Empty({ icon, text, href, action }) { return <div className="grid justify-items-center rounded-2xl border border-dashed border-border p-7 text-center"><ApperIcon name={icon} className="mb-3 text-muted-foreground" /><p className="mb-4 max-w-xs text-sm text-muted-foreground">{text}</p><Link to={href} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{action}</Link></div>; }
function QuickLink({ href, icon, title, text }) { return <Link to={href} className="group rounded-3xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-(--shadow-sm) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="mb-3 flex items-center justify-between"><ApperIcon name={icon} className="text-primary" /><ApperIcon name="ArrowUpRight" className="text-muted-foreground transition group-hover:text-primary" /></div><h3 className="font-heading text-2xl font-bold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></Link>; }
