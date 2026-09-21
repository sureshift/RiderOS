import { useMemo, useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/services/supabaseClient';
import { DATE_FORMATS, formatLocalDate } from '@/utils/date';

export const route = { path: '/orders', layout: 'owner', access: 'public' };
export const nav = { icon: 'PackageCheck', label: 'Orders', section: 'Operations', order: 3 };

const STATUSES = ['Allocated', 'En Route Pickup', 'Arrived Pickup', 'Picked Up', 'En Route Customer', 'Arrived Customer', 'Delivered', 'Cancelled', 'Issue'];

function platformShortCode(name) {
  const normalized = String(name || 'PLT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.includes('SWIGGY')) return 'SWG';
  if (normalized.includes('ZOMATO')) return 'ZOM';
  return normalized.slice(0, 3).padEnd(3, 'X');
}

function orderDatePart(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}${month}${date.getFullYear()}`;
}

async function nextOrderCode(platformId, platformName) {
  const prefix = `${platformShortCode(platformName)}${orderDatePart()}`;
  const { data: existing, error } = await supabase
    .from('orders')
    .select('code')
    .eq('platform_id', platformId)
    .like('code', `${prefix}%`);
  if (error) throw error;
  const sequence = (existing || []).reduce((highest, row) => {
    const suffix = String(row.code || '').slice(prefix.length);
    return /^\d{4}$/.test(suffix) ? Math.max(highest, Number(suffix)) : highest;
  }, 0) + 1;
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

function flattenOrder(row) {
  return { ...row, platform_name: row.platforms?.name, pickup_name: row.places?.name };
}

export default function Orders() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [sort, setSort] = useState('new');
  const [open, setOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ platform_id: 'platform_swiggy', pickup_place_id: '', drop_address: '', earning: '', payment_type: 'PREPAID', cod_amount: '', notes: '' });
  const { data: rawOrders, loading, error, run } = useSupabaseQuery(
    () => supabase
      .from('orders')
      .select('*, platforms(name), places(name)')
      .order('created_at', { ascending: false }),
    []
  );
  const orders = useMemo(() => (rawOrders ?? []).map(flattenOrder), [rawOrders]);
  const { data: platforms } = useSupabaseQuery(
    () => supabase.from('platforms').select('id, name').eq('active', true).order('name'),
    []
  );
  const { data: places } = useSupabaseQuery(
    () => supabase.from('places').select('id, name, type, address, latitude, longitude, platform_id').order('name'),
    []
  );
  const availablePlaces = useMemo(() => (places ?? []).filter(place => !place.platform_id || place.platform_id === form.platform_id), [places, form.platform_id]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orders
      .filter(order => !needle || `${order.code} ${order.platform_name ?? ''} ${order.drop_address ?? ''}`.toLowerCase().includes(needle))
      .filter(order => status === 'All' || order.status === status)
      .sort((a, b) => sort === 'earning'
        ? Number(b.earning) - Number(a.earning)
        : sort === 'old'
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at));
  }, [orders, search, status, sort]);

  function startCreate() {
    setEditingOrder(null);
    setForm({ platform_id: 'platform_swiggy', pickup_place_id: '', drop_address: '', earning: '', payment_type: 'PREPAID', cod_amount: '', notes: '' });
    setOpen(true);
  }

  function startEdit(order) {
    setEditingOrder(order);
    setForm({
      platform_id: order.platform_id || 'platform_swiggy',
      pickup_place_id: order.pickup_place_id || '',
      drop_address: order.drop_address || '',
      earning: String(order.earning ?? ''),
      payment_type: order.payment_type || 'PREPAID',
      cod_amount: String(order.cod_amount ?? ''),
      notes: order.notes || ''
    });
    setOpen(true);
  }

  async function saveOrder(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const platform = (platforms ?? []).find(item => item.id === form.platform_id);
      if (!platform) throw new Error('Select a valid platform before saving the order.');
      const pickup = availablePlaces.find(item => item.id === form.pickup_place_id);
      if (!pickup) throw new Error('Select the restaurant, hub or dark store where this order will be collected.');
      const values = {
        platform_id: platform.id,
        pickup_place_id: pickup.id,
        pickup_address: pickup.address || pickup.name,
        pickup_latitude: Number.isFinite(Number(pickup.latitude)) ? Number(pickup.latitude) : null,
        pickup_longitude: Number.isFinite(Number(pickup.longitude)) ? Number(pickup.longitude) : null,
        drop_address: form.drop_address.trim(),
        earning: Number(form.earning || 0),
        payment_type: form.payment_type,
        cod_amount: form.payment_type === 'COD' ? Number(form.cod_amount || 0) : 0,
        notes: form.notes.trim()
      };
      if (editingOrder) {
        const { error: updateError } = await supabase.from('orders').update({ ...values, updated_at: new Date().toISOString() }).eq('id', editingOrder.id);
        if (updateError) throw updateError;
      } else {
        const code = await nextOrderCode(platform.id, platform.name);
        const { error: insertError } = await supabase.from('orders').insert({
          ...values,
          code,
          status: 'Allocated',
          distance_km: 0,
          duration_min: 0,
          accepted_at: new Date().toISOString()
        });
        if (insertError) throw insertError;
      }
      setForm({ platform_id: 'platform_swiggy', pickup_place_id: '', drop_address: '', earning: '', payment_type: 'PREPAID', cod_amount: '', notes: '' });
      setEditingOrder(null);
      setOpen(false);
      setMessage(editingOrder ? `Order ${editingOrder.code} updated.` : 'Order saved.');
      await run();
    } catch (err) {
      setMessage(err.message || 'Could not save the order.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder(order) {
    if (!window.confirm(`Delete order ${order.code}? This removes it from the database.`)) return;
    const { error: deleteError } = await supabase.from('orders').delete().eq('id', order.id);
    if (deleteError) {
      setMessage(deleteError.message || 'Could not delete the order.');
      return;
    }
    setMessage(`Order ${order.code} deleted.`);
    await run();
  }

  const statusCounts = useMemo(() => STATUSES.reduce((counts, value) => ({ ...counts, [value]: orders.filter(order => order.status === value).length }), {}), [orders]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-primary">Shipment operations</p>
          <h1 className="font-heading text-4xl font-bold">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create, monitor and update every delivery from one queue.</p>
        </div>
        <button onClick={startCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ApperIcon name="Plus" /> Add order
        </button>
      </header>

      <div className="grid gap-2 overflow-x-auto pb-1 sm:grid-cols-4">
        {['All', 'Allocated', 'Picked Up', 'Delivered'].map(value => <button key={value} onClick={() => setStatus(value)} className={`min-w-32 rounded-xl border px-3 py-2.5 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${status === value ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}><span className="block text-xs font-semibold text-muted-foreground">{value}</span><strong className="text-xl tabular-nums">{value === 'All' ? orders.length : statusCounts[value] || 0}</strong></button>)}
      </div>

      {open && <form onSubmit={saveOrder} className="grid gap-4 rounded-3xl border border-border bg-card p-5 md:grid-cols-2">
        <h2 className="md:col-span-2 font-heading text-2xl font-bold">{editingOrder ? `Edit order ${editingOrder.code}` : 'Record an accepted delivery'}</h2>
        <div className="rounded-xl bg-muted p-3 text-sm md:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Order ID</p><p className="mt-1 font-mono font-bold">Auto-generated on save</p><p className="mt-1 text-xs text-muted-foreground">Platform + DDMMYYYY + four-digit daily sequence, for example SWG170920260001.</p></div>
        <label className="text-sm font-semibold">Platform<select value={form.platform_id} onChange={event => setForm({ ...form, platform_id: event.target.value, pickup_place_id: '' })} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{(platforms ?? []).map(platform => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Pickup point<select required value={form.pickup_place_id} onChange={event => setForm({ ...form, pickup_place_id: event.target.value })} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Select restaurant, hub or dark store</option>{availablePlaces.map(place => <option key={place.id} value={place.id}>{place.name} · {place.type}</option>)}</select><span className="mt-1 block text-xs font-normal text-muted-foreground">Saved pickup GPS: {availablePlaces.find(place => place.id === form.pickup_place_id)?.latitude != null ? 'coordinates available' : 'add coordinates in Places'}</span></label>
        <Field label="Customer address" value={form.drop_address} onChange={value => setForm({ ...form, drop_address: value })} required />
        <Field label="Expected earning ₹" type="number" value={form.earning} onChange={value => setForm({ ...form, earning: value })} />
        <label className="text-sm font-semibold">Payment type<select value={form.payment_type} onChange={event => setForm({ ...form, payment_type: event.target.value })} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="PREPAID">Prepaid</option><option value="COD">COD — collect at delivery</option></select></label>
        {form.payment_type === 'COD' && <Field label="COD amount to collect ₹" type="number" value={form.cod_amount} onChange={value => setForm({ ...form, cod_amount: value })} required />}
        <label className="text-sm font-semibold md:col-span-2">Notes<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        <div className="flex gap-2 md:col-span-2"><button disabled={saving} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50">{saving ? 'Saving…' : editingOrder ? 'Save changes' : 'Save order'}</button><button type="button" onClick={() => { setOpen(false); setEditingOrder(null); }} className="rounded-xl bg-muted px-5 py-3 font-bold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Cancel</button></div>
      </form>}

      {message && <div role="status" className="rounded-xl bg-muted p-3 text-sm">{message}</div>}
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2">
        <label className="flex min-w-52 flex-1 items-center gap-2 rounded-xl bg-muted px-3"><ApperIcon name="Search" className="text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order, platform or address" className="w-full bg-transparent py-3 outline-none" /></label>
        <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-xl border border-input bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option>All</option>{STATUSES.map(value => <option key={value}>{value}</option>)}</select>
        <select value={sort} onChange={event => setSort(event.target.value)} className="rounded-xl border border-input bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="earning">Highest earning</option></select>
      </div>

      {loading ? <LoadingRows /> : error ? <ErrorState message={error.message} retry={run} /> : rows.length === 0 ? <EmptyState onAdd={() => setOpen(true)} /> : <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="hidden grid-cols-[1.2fr_.7fr_1fr_1fr_.65fr_auto] gap-3 bg-muted px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground md:grid"><span>Order</span><span>Platform</span><span>Status</span><span>Destination</span><span>Earning</span><span>Actions</span></div>
        {rows.map(order => <div key={order.id} className="grid gap-3 border-t border-border px-4 py-3.5 first:border-0 md:grid-cols-[1.2fr_.7fr_1fr_1fr_.65fr_auto] md:items-center">
          <div><strong className="block">{order.code}</strong><small className="text-xs text-muted-foreground">{formatLocalDate(order.created_at, DATE_FORMATS.SHORT)}</small></div>
          <span className="text-sm">{order.platform_name || '—'}</span>
          <StatusBadge status={order.status} />
          <span className="truncate text-sm" title={order.drop_address || ''}>{order.drop_address || 'No drop address'}</span>
          <strong className="tabular-nums">₹{Number(order.earning).toFixed(0)}</strong>
          <div className="flex gap-1">
            <button aria-label={`Edit ${order.code}`} onClick={() => startEdit(order)} className="rounded-lg p-2 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Pencil" className="h-4 w-4" /></button>
            <button aria-label={`Delete ${order.code}`} onClick={() => deleteOrder(order)} className="rounded-lg p-2 text-destructive transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Trash2" className="h-4 w-4" /></button>
          </div>
        </div>)}
      </div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const active = ['Allocated', 'En Route Pickup', 'Arrived Pickup', 'Picked Up', 'En Route Customer', 'Arrived Customer'].includes(status);
  const done = status === 'Delivered';
  const tone = done ? 'bg-success/10 text-success' : active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground';
  return <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
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
  return <div className="grid justify-items-center rounded-3xl border border-dashed border-border p-10 text-center"><ApperIcon name="PackageOpen" className="mb-3 text-muted-foreground" /><p className="mb-4 max-w-md text-sm text-muted-foreground">Your order ledger is empty. Add the first accepted delivery to start tracking the shift.</p><button onClick={onAdd} className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Add first order</button></div>;
}
