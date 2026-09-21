import { useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/services/supabaseClient';

export const route = { path: '/places', layout: 'owner', access: 'public' };
export const nav = { icon: 'MapPin', label: 'Places', section: 'Operations', order: 4 };

const PLACE_TYPES = ['Restaurant', 'Hub', 'Dark Store'];
const PLATFORM_CATEGORIES = ['Food', 'Hyperlocal', 'Parcel', 'Other'];

export default function Places() {
  const [tab, setTab] = useState('places');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyPlace());
  const { data: places, loading: placesLoading, error: placesError, run: reloadPlaces } = useSupabaseQuery(() => supabase.from('places').select('*').order('name'), []);
  const { data: platforms, loading: platformsLoading, error: platformsError, run: reloadPlatforms } = useSupabaseQuery(() => supabase.from('platforms').select('*').order('name'), []);

  const source = tab === 'places' ? places : platforms;
  const rows = (source ?? []).filter(row => `${row.name} ${row.address ?? ''} ${row.type ?? ''} ${row.category ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  function startCreate() {
    setEditing(null);
    setForm(tab === 'places' ? emptyPlace() : emptyPlatform());
    setOpen(true);
  }

  function startEdit(row) {
    setEditing(row);
    setForm(tab === 'places'
      ? { name: row.name, type: row.type, address: row.address ?? '', latitude: row.latitude ?? '', longitude: row.longitude ?? '', platform_id: row.platform_id ?? '', notes: row.notes ?? '' }
      : { name: row.name, category: row.category ?? 'Other', active: Boolean(row.active), notes: row.notes ?? '' });
    setOpen(true);
  }

  async function saveRecord(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (tab === 'places') {
        const values = { name: form.name.trim(), type: form.type, address: form.address.trim(), latitude: form.latitude === '' ? null : Number(form.latitude), longitude: form.longitude === '' ? null : Number(form.longitude), platform_id: form.platform_id || null, notes: form.notes.trim() };
        const { error: saveError } = editing
          ? await supabase.from('places').update({ ...values, updated_at: new Date().toISOString() }).eq('id', editing.id)
          : await supabase.from('places').insert(values);
        if (saveError) throw saveError;
      } else {
        const values = { name: form.name.trim(), category: form.category, active: Boolean(form.active), notes: form.notes.trim() };
        const { error: saveError } = editing
          ? await supabase.from('platforms').update({ ...values, updated_at: new Date().toISOString() }).eq('id', editing.id)
          : await supabase.from('platforms').insert(values);
        if (saveError) throw saveError;
      }
      setOpen(false);
      setMessage(editing ? 'Changes saved.' : `${tab === 'places' ? 'Place' : 'Platform'} added.`);
      await Promise.all([reloadPlaces(), reloadPlatforms()]);
    } catch (err) {
      setMessage(err.message || 'Could not save the record.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(row) {
    if (!window.confirm(`Delete ${row.name}?`)) return;
    const { error: deleteError } = await supabase.from(tab).delete().eq('id', row.id);
    if (deleteError) {
      setMessage(deleteError.message || 'Could not delete the record.');
      return;
    }
    setMessage(`${row.name} deleted.`);
    await Promise.all([reloadPlaces(), reloadPlatforms()]);
  }

  const loading = tab === 'places' ? placesLoading : platformsLoading;
  const error = tab === 'places' ? placesError : platformsError;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">Your delivery network</p><h1 className="font-heading text-5xl font-bold">Places & platforms</h1><p className="mt-2 text-muted-foreground">Maintain the locations and delivery channels you use repeatedly.</p></div><button onClick={startCreate} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Plus" /> Add {tab === 'places' ? 'place' : 'platform'}</button></header>
    <div className="flex flex-wrap gap-3 rounded-2xl border border-border bg-card p-3"><div className="flex rounded-xl bg-muted p-1">{[['places', 'Places'], ['platforms', 'Platforms']].map(([value, label]) => <button key={value} onClick={() => { setTab(value); setOpen(false); }} className={`rounded-lg px-4 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div><label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl bg-muted px-3"><ApperIcon name="Search" className="text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search your network" className="w-full bg-transparent py-3 outline-none" /></label></div>
    {message && <div role="status" className="rounded-xl bg-muted p-3 text-sm">{message}</div>}
    {open && <form onSubmit={saveRecord} className="grid gap-4 rounded-3xl border border-border bg-card p-5 md:grid-cols-2"><h2 className="md:col-span-2 font-heading text-2xl font-bold">{editing ? 'Edit' : 'Add'} {tab === 'places' ? 'place' : 'platform'}</h2><Field label="Name" required value={form.name} onChange={value => setForm({ ...form, name: value })} />{tab === 'places' ? <><SelectField label="Type" value={form.type} options={PLACE_TYPES} onChange={value => setForm({ ...form, type: value })} /><Field label="Address" value={form.address} onChange={value => setForm({ ...form, address: value })} /><Field label="Latitude" type="number" step="any" value={form.latitude} onChange={value => setForm({ ...form, latitude: value })} /><Field label="Longitude" type="number" step="any" value={form.longitude} onChange={value => setForm({ ...form, longitude: value })} /><SelectField label="Linked platform" value={form.platform_id} options={['', ...(platforms ?? []).map(platform => platform.id)]} labels={['No linked platform', ...(platforms ?? []).map(platform => platform.name)]} onChange={value => setForm({ ...form, platform_id: value })} /></> : <><SelectField label="Category" value={form.category} options={PLATFORM_CATEGORIES} onChange={value => setForm({ ...form, category: value })} /><label className="flex items-center gap-2 self-end rounded-xl bg-muted px-3 py-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(form.active)} onChange={event => setForm({ ...form, active: event.target.checked })} /> Active platform</label></>}<label className="text-sm font-semibold md:col-span-2">Notes<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><div className="flex gap-2 md:col-span-2"><button disabled={saving} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-muted px-5 py-3 font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Cancel</button></div></form>}
    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4].map(item => <div key={item} className="h-36 animate-pulse rounded-3xl bg-muted" />)}</div> : error ? <div className="rounded-2xl bg-destructive/10 p-5 text-sm text-destructive">{error.message}<button onClick={tab === 'places' ? reloadPlaces : reloadPlatforms} className="ml-3 underline">Retry</button></div> : rows.length === 0 ? <div className="grid justify-items-center rounded-3xl border border-dashed border-border p-10 text-center"><ApperIcon name="MapPin" className="mb-3 text-muted-foreground" /><p className="mb-4 text-sm text-muted-foreground">No records yet. Add the first {tab === 'places' ? 'restaurant, hub or dark store' : 'delivery platform'}.</p><button onClick={startCreate} className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground">Add {tab === 'places' ? 'place' : 'platform'}</button></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(row => <article key={row.id} className="rounded-3xl border border-border bg-card p-5 transition hover:shadow-(--shadow-sm)"><div className="mb-4 flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><ApperIcon name={tab === 'places' ? row.type === 'Hub' ? 'Warehouse' : row.type === 'Dark Store' ? 'Store' : 'Utensils' : 'Layers'} /></span><div className="flex gap-1"><button aria-label={`Edit ${row.name}`} onClick={() => startEdit(row)} className="rounded-lg p-2 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Pencil" /></button><button aria-label={`Delete ${row.name}`} onClick={() => deleteRecord(row)} className="rounded-lg p-2 text-destructive transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Trash2" /></button></div></div><h2 className="font-heading text-2xl font-bold">{row.name}</h2><span className="mt-1 inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">{tab === 'places' ? row.type : row.category}</span>{tab === 'places' ? <><p className="mt-3 text-sm text-muted-foreground">{row.address || 'No address saved'}</p><p className="mt-2 text-xs text-muted-foreground">{row.latitude != null && row.longitude != null ? `${row.latitude}, ${row.longitude}` : 'No GPS coordinates saved'}</p></> : <p className="mt-3 text-sm text-muted-foreground">{row.active ? 'Active' : 'Paused'} · {row.notes || 'No notes'}</p>}</article>)}</div>}
  </div>;
}

function emptyPlace() { return { name: '', type: 'Restaurant', address: '', latitude: '', longitude: '', platform_id: '', notes: '' }; }
function emptyPlatform() { return { name: '', category: 'Food', active: true, notes: '' }; }
function Field({ label, value, onChange, type = 'text', step, required }) { return <label className="text-sm font-semibold">{label}<input required={required} type={type} step={step} value={value} onChange={event => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>; }
function SelectField({ label, value, options, labels, onChange }) { return <label className="text-sm font-semibold">{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{options.map((option, index) => <option key={option || `empty-${index}`} value={option}>{labels?.[index] ?? option}</option>)}</select></label>; }
