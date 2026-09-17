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
  const { data: places, loading: placesLoading, error: placesError, run: reloadPlaces } = useLocalQuery('SELECT * FROM places ORDER BY name', [], []);
  const delivered = (orders ?? []).filter(order => order.status === 'Delivered');
  const earnings = delivered.reduce((sum, order) => sum + Number(order.earning || 0), 0);
  const distance = delivered.reduce((sum, order) => sum + Number(order.distance_km || 0), 0);
  const duration = delivered.reduce((sum, order) => sum + Number(order.duration_min || 0), 0);
  const gpsTrackingPoints = (events ?? []).filter(event => event.event_type === 'tracking').length;
  const milestonePoints = (events ?? []).length - gpsTrackingPoints;
  const avgDelivery = delivered.length ? duration / delivered.length : 0;
  const pickupWaitRows = delivered.filter(order => order.arrived_pickup_at && order.picked_up_at);
  const customerWaitRows = delivered.filter(order => order.arrived_customer_at && order.delivered_at);
  const customerTravelRows = delivered.filter(order => order.picked_up_at && order.arrived_customer_at);
  const pickupTravelRows = delivered.filter(order => order.accepted_at && order.arrived_pickup_at);
  const pickupWait = pickupWaitRows.length ? pickupWaitRows.reduce((sum, order) => sum + elapsedMinutes(order.arrived_pickup_at, order.picked_up_at), 0) / pickupWaitRows.length : 0;
  const customerWait = customerWaitRows.length ? customerWaitRows.reduce((sum, order) => sum + elapsedMinutes(order.arrived_customer_at, order.delivered_at), 0) / customerWaitRows.length : 0;
  const customerTravel = customerTravelRows.length ? customerTravelRows.reduce((sum, order) => sum + elapsedMinutes(order.picked_up_at, order.arrived_customer_at), 0) / customerTravelRows.length : 0;
  const pickupTravel = pickupTravelRows.length ? pickupTravelRows.reduce((sum, order) => sum + elapsedMinutes(order.accepted_at, order.arrived_pickup_at), 0) / pickupTravelRows.length : 0;
  const gps = (events ?? []).filter(event => Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude)));
  const allocationHotspots = useMemo(() => {
    const counts = new Map();
    (orders ?? []).forEach(order => {
      if (!order.pickup_place_id) return;
      counts.set(order.pickup_place_id, (counts.get(order.pickup_place_id) || 0) + 1);
    });
    return (places ?? [])
      .filter(place => Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude)))
      .map(place => ({ ...place, allocationCount: counts.get(place.id) || 0 }))
      .filter(place => place.allocationCount > 0)
      .sort((a, b) => b.allocationCount - a.allocationCount);
  }, [orders, places]);
  const center = useMemo(() => allocationHotspots.length
    ? [Number(allocationHotspots[0].latitude), Number(allocationHotspots[0].longitude)]
    : gps.length ? [Number(gps[0].latitude), Number(gps[0].longitude)] : null,
  [allocationHotspots, gps]);
  const platformTotals = {};
  delivered.forEach(order => { const key = order.platform_id || 'Unassigned'; platformTotals[key] = (platformTotals[key] || 0) + Number(order.earning || 0); });
  const maxPlatform = Math.max(1, ...Object.values(platformTotals));
  const error = ordersError || eventsError || placesError;

  return <div className="space-y-6"><header><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">Your operational memory</p><h1 className="font-heading text-5xl font-bold">Shift intelligence</h1><p className="mt-2 text-muted-foreground">Every metric below is calculated from your local SQLite records.</p></header>
    {ordersLoading || eventsLoading || placesLoading ? <Loading /> : error ? <div className="rounded-2xl bg-destructive/10 p-5 text-destructive">{error.message}<button onClick={() => { reloadOrders(); reloadEvents(); reloadPlaces(); }} className="ml-3 underline">Retry</button></div> : <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Delivered earnings" value={`₹${earnings.toFixed(0)}`} icon="IndianRupee" /><Stat label="Distance recorded" value={`${distance.toFixed(1)} km`} icon="Route" /><Stat label="Avg delivery time" value={formatMinutes(avgDelivery)} icon="Clock" /><Stat label="Earning / km" value={`₹${(distance ? earnings / distance : 0).toFixed(1)}`} icon="TrendingUp" /></section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Pickup travel" value={formatMinutes(pickupTravel)} icon="Navigation" /><Stat label="Pickup wait" value={formatMinutes(pickupWait)} icon="Timer" /><Stat label="Customer travel" value={formatMinutes(customerTravel)} icon="Bike" /><Stat label="Customer handoff" value={formatMinutes(customerWait)} icon="Handshake" /></section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="GPS tracking points" value={gpsTrackingPoints} icon="Radar" /><Stat label="Milestone points" value={milestonePoints} icon="MapPin" /><Stat label="Completed orders" value={delivered.length} icon="PackageCheck" /><Stat label="Average earning" value={`₹${(delivered.length ? earnings / delivered.length : 0).toFixed(0)}`} icon="IndianRupee" /></section>
      <section className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]"><div className="rounded-3xl border border-border bg-card p-6"><h2 className="font-heading text-3xl font-bold">Earnings by platform</h2><p className="mb-6 text-sm text-muted-foreground">Completed orders only</p>{Object.keys(platformTotals).length === 0 ? <p className="text-sm text-muted-foreground">Complete orders to see platform totals.</p> : <div className="space-y-5">{Object.entries(platformTotals).sort((a, b) => b[1] - a[1]).map(([platform, value]) => <div key={platform}><div className="mb-2 flex justify-between"><strong>{platform}</strong><span className="font-bold tabular-nums">₹{value.toFixed(0)}</span></div><div className="h-3 rounded-full bg-muted"><div className="h-3 rounded-full bg-primary" style={{ width: `${value / maxPlatform * 100}%` }} /></div></div>)}</div>}</div>
        <div className="rounded-3xl border border-border bg-card p-6"><h2 className="font-heading text-3xl font-bold">Operational signals</h2><div className="mt-5 space-y-3"><Signal icon="Gauge" title={`${delivered.length} completed deliveries`} text="Build a larger sample before treating performance patterns as stable." /><Signal icon="IndianRupee" title={`₹${(duration ? earnings / (duration / 60) : 0).toFixed(0)} per recorded hour`} text="Uses delivery durations entered on completed orders; it does not estimate unpaid online time." /><Signal icon="MapPinned" title={`${gps.length} location points`} text="The map below shows the actual coordinates you captured during milestones." /></div></div></section>
      <section className="overflow-hidden rounded-3xl border border-border bg-card"><div className="flex flex-wrap items-end justify-between gap-3 p-6"><div><h2 className="font-heading text-3xl font-bold">Order allocation heatmap</h2><p className="text-sm text-muted-foreground">Pickup locations from your saved orders. Larger circles mean more orders were allocated there; this highlights recurring order sources, not customer delivery destinations.</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">{allocationHotspots.length} hotspots</span></div>{allocationHotspots.length === 0 || !center ? <div className="grid min-h-72 place-items-center border-t border-border p-8 text-center"><div><ApperIcon name="Map" className="mx-auto mb-3 text-muted-foreground" /><p className="text-sm text-muted-foreground">No geocoded pickup allocations yet. Add latitude and longitude to your pickup places, then select those places when recording orders.</p></div></div> : <div className="h-[480px] border-t border-border"><MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{allocationHotspots.map(place => <CircleMarker key={place.id} center={[Number(place.latitude), Number(place.longitude)]} radius={Math.min(28, 8 + place.allocationCount * 3)} pathOptions={{ className: 'gps-point' }}><Tooltip>{place.name} · {place.allocationCount} allocated {place.allocationCount === 1 ? 'order' : 'orders'}</Tooltip></CircleMarker>)}</MapContainer></div>}<div className="border-t border-border px-6 py-3 text-xs text-muted-foreground">GPS tracking data remains recorded separately ({gps.length} points) for route review; it does not determine these hotspot counts.</div></section>
    </>}
  </div>;
}

function Stat({ label, value, icon }) { return <div className="rounded-3xl border border-border bg-card p-5"><div className="mb-4 flex justify-between text-muted-foreground"><span className="text-sm font-semibold">{label}</span><ApperIcon name={icon} className="text-primary" /></div><strong className="font-heading text-4xl tabular-nums">{value}</strong></div>; }
function elapsedMinutes(start, end) { return Math.max(0, (new Date(end) - new Date(start)) / 60000); }
function formatMinutes(minutes) { const total = Math.round(Number(minutes) || 0); const hours = Math.floor(total / 60); const mins = total % 60; return hours ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${mins}m`; }
function Signal({ icon, title, text }) { return <div className="flex gap-3 rounded-2xl bg-muted/60 p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ApperIcon name={icon} /></span><div><strong>{title}</strong><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div></div>; }
function Loading() { return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <div key={item} className="h-32 animate-pulse rounded-3xl bg-muted" />)}</div>; }
