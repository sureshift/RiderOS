import { useMemo, useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { useLocalQuery } from '@/hooks/useLocalTable';
import { insert, remove, update } from '@/services/localDb';
import { DATE_FORMATS, formatLocalDate } from '@/utils/date';

export const route = { path: '/orders', layout: 'owner', access: 'public' };
export const nav = { icon: 'PackageCheck', label: 'Orders', section: 'Operations', order: 3 };

const STATUSES = ['Accepted', 'To Pickup', 'Arrived Pickup', 'Picked Up', 'To Drop', 'Delivered', 'Cancelled', 'Issue'];

export default function Orders() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [sort, setSort] = useState('new');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ code: '', platform_id: 'platform_swiggy', pickup_address: '', drop_address: '', earning: '', distance_km: '', notes: '' });
  const { data: orders, loading, error, run } = useLocalQuery(
    `SELECT o.*, p.name AS platform_name, pl.name AS pickup_name
     FROM orders o
     LEFT JOIN platforms p ON p.id = o.platform_id
     LEFT JOIN places pl ON pl.id = o.pickup_place_id
     ORDER BY o.created_at DESC`,
    [],
    []
  );
  const { data: platforms } = useLocalQuery('SELECT id, name FROM platforms WHERE active = 1 ORDER BY name', [], []);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (orders ?? [])
      .filter(order => !needle || `${order.code} ${order.platform_name ?? ''} ${order.drop_address ?? ''}`.toLowerCase().includes(needle))
      .filter(order => status === 'All' || order.status === status)
      .sort((a, b) => sort === 'earning'
        ? Number(b.earning) - Number(a.earning)
        : sort === 'old'
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at));
  }, [orders, search, status, sort]);

  async function createOrder(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await insert('orders', {
        code: form.code.trim(),
        platform_id: form.platform_id || null,
        status: 'Accepted',
        pickup_address: form.pickup_address.trim(),
        drop_address: form.drop_address.trim(),
        earning: Number(form.earning || 0),
        distance_km: Number(form.distance_km || 0),
        notes: form.notes.trim(),
        accepted_at: new Date().toISOString()
      }, 'ord');
      setForm({ code: '', platform_id: 'platform_swiggy', pickup_address: '', drop_address: '', earning: '', distance_km: '', notes: '' });
      setOpen(false);
      setMessage('Order saved locally in SQLite.');
      await run();
    } catch (err) {
      setMessage(err.message || 'Could not save the order.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(order, nextStatus) {
    const updates = { status: nextStatus };
    if (nextStatus === 'Picked Up') updates.picked_up_at = new Date().toISOString();
    if (nextStatus === 'Delivered') updates.delivered_at = new Date().toISOString();
    await update('orders', order.id, updates);
    setMessage(`${order.code} moved to ${nextStatus}.`);
    await run();
  }

  async function deleteOrder(order) {
    if (!window.confirm(`Delete order ${order.code}? This removes it from the local database.`)) return;
    await remove('orders', order.id);
    setMessage(`Order ${order.code} deleted.`);
    await run();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">Local SQLite ledger</p>
          <h1 className="font-heading text-5xl font-bold">Orders</h1>
          <p className="mt-2 text-muted-foreground">Enter every delivery yourself. Nothing depends on a platform API.</p>
        </div>
        <button onClick={() => setOpen(value => !value)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ApperIcon name="Plus" /> Add order
        </button>
      </header>

      {open && <form onSubmit={createOrder} className="grid gap-4 rounded-3xl border border-border bg-card p-5 md:grid-cols-2">
        <h2 className="md:col-span-2 font-heading text-2xl font-bold">Record an accepted delivery</h2>
        <Field label="Order ID / code" required value={form.code} onChange={value => setForm({ ...form, code: value })} />
        <label className="text-sm font-semibold">Platform<select value={form.platform_id} onChange={event => setForm({ ...form, platform_id: event.target.value })} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{(platforms ?? []).map(platform => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></label>
        <Field label="Pickup address" value={form.pickup_address} onChange={value => setForm({ ...form, pickup_address: value })} />
        <Field label="Drop address" value={form.drop_address} onChange={value => setForm({ ...form, drop_address: value })} />
        <Field label="Expected earning ₹" type="number" value={form.earning} onChange={value => setForm({ ...form, earning: value })} />
        <Field label="Estimated distance km" type="number" step="0.1" value={form.distance_km} onChange={value => setForm({ ...form, distance_km: value })} />
        <label className="text-sm font-semibold md:col-span-2">Notes<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        <div className="flex gap-2 md:col-span-2"><button disabled={saving} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50">{saving ? 'Saving…' : 'Save order'}</button><button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-muted px-5 py-3 font-bold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Cancel</button></div>
      </form>}

      {message && <div role="status" className="rounded-xl bg-muted p-3 text-sm">{message}</div>}
      <div className="flex flex-wrap gap-3 rounded-2xl border border-border bg-card p-3">
        <label className="flex min-w-52 flex-1 items-center gap-2 rounded-xl bg-muted px-3"><ApperIcon name="Search" className="text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order, platform or address" className="w-full bg-transparent py-3 outline-none" /></label>
        <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-xl border border-input bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option>All</option>{STATUSES.map(value => <option key={value}>{value}</option>)}</select>
        <select value={sort} onChange={event => setSort(event.target.value)} className="rounded-xl border border-input bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="earning">Highest earning</option></select>
      </div>

      {loading ? <LoadingRows /> : error ? <ErrorState message={error.message} retry={run} /> : rows.length === 0 ? <EmptyState onAdd={() => setOpen(true)} /> : <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="hidden grid-cols-[1.2fr_.8fr_1fr_1fr_.7fr_auto] gap-3 bg-muted px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground md:grid"><span>Order</span><span>Platform</span><span>Phase</span><span>Destination</span><span>Earning</span><span>Actions</span></div>
        {rows.map(order => <div key={order.id} className="grid gap-3 border-t border-border px-5 py-4 first:border-0 md:grid-cols-[1.2fr_.8fr_1fr_1fr_.7fr_auto] md:items-center">
          <div><strong className="block">{order.code}</strong><small className="text-xs text-muted-foreground">{formatLocalDate(order.created_at, DATE_FORMATS.SHORT)}</small></div>
          <span className="text-sm">{order.platform_name || '—'}</span>
          <select value={order.status} onChange={event => changeStatus(order, event.target.value)} className="w-full rounded-lg border border-input bg-background px-2 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{STATUSES.map(value => <option key={value}>{value}</option>)}</select>
          <span className="truncate text-sm" title={order.drop_address || ''}>{order.drop_address || 'No drop address'}</span>
          <strong className="tabular-nums">₹{Number(order.earning).toFixed(0)}</strong>
          <button aria-label={`Delete ${order.code}`} onClick={() => deleteOrder(order)} className="rounded-lg p-2 text-destructive transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Trash2" /></button>
        </div>)}
      </div>}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', step, required }) {
  return <label className="text-sm font-semibold">{label}<input required={required} type={type} step={step} value={value} onChange={event => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>;
}

function LoadingRows() {
  return <div className="space-y-3">{[1, 2, 3, 4].map(item => <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>;
}

function ErrorState({ message, retry }) {
  return <div className="rounded-2xl bg-destructive/10 p-5 text-sm text-destructive">{message}<button onClick={retry} className="ml-3 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Retry</button></div>;
}

function EmptyState({ onAdd }) {
  return <div className="grid justify-items-center rounded-3xl border border-dashed border-border p-10 text-center"><ApperIcon name="PackageOpen" className="mb-3 text-muted-foreground" /><p className="mb-4 max-w-md text-sm text-muted-foreground">Your local order ledger is empty. Add the first accepted delivery to start tracking the shift.</p><button onClick={onAdd} className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Add first order</button></div>;
}
