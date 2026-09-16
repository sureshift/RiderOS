import { useMemo, useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { useLocalQuery } from '@/hooks/useLocalTable';
import { insert, remove, update } from '@/services/localDb';

export const route = { path: '/goals', layout: 'owner', access: 'public' };
export const nav = { icon: 'Wallet', label: 'Goals & money', section: 'Operations', order: 5 };
const RULES = ['Fixed per delivery', 'Percent of earnings', 'Daily remainder'];

export default function Goals() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyForm());
  const { data: goals, loading, error, run } = useLocalQuery('SELECT * FROM goals ORDER BY created_at DESC', [], []);
  const { data: deliveredOrders } = useLocalQuery("SELECT earning, delivered_at, created_at FROM orders WHERE status = 'Delivered'", [], []);
  const { data: activeOrders } = useLocalQuery("SELECT id FROM orders WHERE status NOT IN ('Delivered','Cancelled')", [], []);
  const { data: riders } = useLocalQuery('SELECT id FROM riders WHERE active = 1', [], []);
  const rows = goals ?? [];
  const delivered = deliveredOrders ?? [];
  const openOrders = activeOrders ?? [];
  const activeRiders = riders ?? [];
  const saved = rows.reduce((sum, goal) => sum + Number(goal.saved || 0), 0);
  const target = rows.reduce((sum, goal) => sum + Number(goal.target || 0), 0);
  const orderIntensity = getOrderIntensity(openOrders.length, activeRiders.length);
  const goalMetrics = useMemo(() => rows.map(goal => getGoalMetrics(goal, delivered)), [rows, delivered]);

  function create() { setEditing(null); setForm(emptyForm()); setOpen(true); }
  function edit(goal) { setEditing(goal); setForm({ name: goal.name, target: goal.target, saved: goal.saved, deadline: goal.deadline ?? '', rule: goal.rule, rule_value: goal.rule_value, active: Boolean(goal.active) }); setOpen(true); }
  async function saveGoal(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const values = { name: form.name.trim(), target: Number(form.target), saved: Number(form.saved || 0), deadline: form.deadline || null, rule: form.rule, rule_value: Number(form.rule_value || 0), active: form.active ? 1 : 0 };
      if (editing) await update('goals', editing.id, values); else await insert('goals', values, 'goal');
      setOpen(false);
      setMessage(editing ? 'Goal updated.' : 'Goal created.');
      await run();
    } catch (err) { setMessage(err.message || 'Could not save the goal.'); } finally { setSaving(false); }
  }
  async function deleteGoal(goal) { if (!window.confirm(`Delete ${goal.name}?`)) return; await remove('goals', goal.id); setMessage('Goal deleted.'); await run(); }

  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">Give earnings a purpose</p><h1 className="font-heading text-5xl font-bold">Goals & money</h1><p className="mt-2 text-muted-foreground">Keep savings targets and allocation rules beside your delivery data.</p></div><button onClick={create} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Plus" /> New goal</button></header>
    <section className="grid gap-4 md:grid-cols-3"><Stat label="Saved" value={`₹${saved.toLocaleString('en-IN')}`} /><Stat label="Combined target" value={`₹${target.toLocaleString('en-IN')}`} /><Stat label="Funded" value={`${target ? Math.min(100, Math.round(saved / target * 100)) : 0}%`} /></section>
    {message && <div role="status" className="rounded-xl bg-muted p-3 text-sm">{message}</div>}
    {open && <form onSubmit={saveGoal} className="grid gap-4 rounded-3xl border border-border bg-card p-5 md:grid-cols-2"><h2 className="md:col-span-2 font-heading text-2xl font-bold">{editing ? 'Edit goal' : 'Create a money goal'}</h2><Field label="Goal name" required value={form.name} onChange={value => setForm({ ...form, name: value })} /><Field label="Target ₹" required type="number" min="1" value={form.target} onChange={value => setForm({ ...form, target: value })} /><Field label="Already saved ₹" type="number" min="0" value={form.saved} onChange={value => setForm({ ...form, saved: value })} /><Field label="Deadline" type="date" value={form.deadline} onChange={value => setForm({ ...form, deadline: value })} /><Select label="Allocation rule" value={form.rule} options={RULES} onChange={value => setForm({ ...form, rule: value })} /><Field label="Rule value" type="number" min="0" step="0.01" value={form.rule_value} onChange={value => setForm({ ...form, rule_value: value })} /><label className="flex items-center gap-2 self-end rounded-xl bg-muted px-3 py-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(form.active)} onChange={event => setForm({ ...form, active: event.target.checked })} /> Active goal</label><div className="flex gap-2 md:col-span-2"><button disabled={saving} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50">{saving ? 'Saving…' : 'Save goal'}</button><button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-muted px-5 py-3 font-bold">Cancel</button></div></form>}
    {loading ? <div className="grid gap-4 md:grid-cols-2">{[1, 2].map(item => <div key={item} className="h-52 animate-pulse rounded-3xl bg-muted" />)}</div> : error ? <div className="rounded-xl bg-destructive/10 p-4 text-destructive">{error.message}<button onClick={run} className="ml-3 underline">Retry</button></div> : rows.length === 0 ? <div className="grid justify-items-center rounded-3xl border border-dashed border-border p-10 text-center"><ApperIcon name="Target" className="mb-3 text-muted-foreground" /><p className="mb-4 text-sm text-muted-foreground">No goals yet. Create one to track your savings target.</p><button onClick={create} className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground">Create first goal</button></div> : <div className="grid gap-4 xl:grid-cols-2">{rows.map(goal => { const percent = Math.min(100, Math.round(Number(goal.saved) / Math.max(1, Number(goal.target)) * 100)); return <article key={goal.id} className="rounded-3xl border border-border bg-card p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">{goal.active ? 'Active' : 'Paused'}</span><h2 className="mt-2 font-heading text-3xl font-bold">{goal.name}</h2><p className="mt-1 text-sm text-muted-foreground">{goal.rule} · {goal.rule_value}{goal.rule === 'Percent of earnings' ? '%' : ' ₹'}</p></div><div className="flex gap-1"><button aria-label={`Edit ${goal.name}`} onClick={() => edit(goal)} className="rounded-lg p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Pencil" /></button><button aria-label={`Delete ${goal.name}`} onClick={() => deleteGoal(goal)} className="rounded-lg p-2 text-destructive hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Trash2" /></button></div></div><div className="mb-3 flex items-end justify-between"><strong className="font-heading text-4xl tabular-nums">₹{Number(goal.saved).toLocaleString('en-IN')}</strong><span className="text-sm text-muted-foreground">of ₹{Number(goal.target).toLocaleString('en-IN')}</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{percent}% funded</span><span>{goal.deadline || 'No deadline'}</span></div>{(() => { const metric = goalMetrics.find(item => item.id === goal.id); return metric ? <div className="mt-5 grid gap-3 sm:grid-cols-2"><GoalMetric label="Required today" value={`₹${metric.todayTarget.toLocaleString('en-IN')}`} /><GoalMetric label="Required / hour" value={`₹${metric.hourlyTarget.toLocaleString('en-IN')}`} /><GoalMetric label="Carried shortfall" value={`₹${metric.shortfall.toLocaleString('en-IN')}`} /><GoalMetric label="Days left" value={`${metric.daysRemaining}`} /></div> : null; })()}</article>; })}</div>}
    <section className="rounded-3xl border border-border bg-muted p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Allocation pressure</p><h2 className="mt-1 font-heading text-2xl font-bold">{orderIntensity.label}</h2><p className="mt-1 text-sm text-muted-foreground">{openOrders.length} open orders · {activeRiders.length} active riders. Targets tighten as the deadline approaches and carry forward any shortfall.</p></div><span className="rounded-full bg-card px-3 py-2 text-sm font-bold">{orderIntensity.multiplier.toFixed(1)}x order pressure</span></div></section>
  </div>;
}

function emptyForm() { return { name: '', target: '', saved: '0', deadline: '', rule: 'Percent of earnings', rule_value: '10', active: true }; }
function Stat({ label, value }) { return <div className="rounded-3xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><strong className="mt-2 block font-heading text-4xl tabular-nums">{value}</strong></div>; }
function GoalMetric({ label, value }) { return <div className="rounded-2xl bg-muted p-3"><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-sm tabular-nums">{value}</strong></div>; }
function Field({ label, value, onChange, type = 'text', min, step, required }) { return <label className="text-sm font-semibold">{label}<input required={required} type={type} min={min} step={step} value={value} onChange={event => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>; }
function Select({ label, value, options, onChange }) { return <label className="text-sm font-semibold">{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{options.map(option => <option key={option}>{option}</option>)}</select></label>; }

function getGoalMetrics(goal, deliveredOrders) {
  const target = Number(goal.target || 0);
  const saved = Number(goal.saved || 0);
  const start = new Date(goal.created_at || new Date().toISOString());
  const deadline = goal.deadline ? new Date(`${goal.deadline}T23:59:59`) : null;
  const now = new Date();
  const goalEarnings = deliveredOrders.reduce((sum, order) => {
    const deliveredAt = new Date(order.delivered_at || order.created_at);
    return deliveredAt >= start && (!deadline || deliveredAt <= deadline) ? sum + Number(order.earning || 0) : sum;
  }, 0);
  const progress = saved + goalEarnings;
  const remaining = Math.max(0, target - progress);
  const daysRemaining = deadline ? Math.max(1, Math.ceil((deadline.getTime() - now.getTime()) / 86400000)) : 1;
  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000));
  const totalDays = Math.max(1, daysElapsed + daysRemaining);
  const expectedProgress = Math.min(target, target * daysElapsed / totalDays);
  const shortfall = Math.max(0, expectedProgress - progress);
  const adjustedRemaining = remaining + shortfall;
  const todayTarget = Math.ceil(adjustedRemaining / daysRemaining);
  const hoursRemaining = Math.max(1, 12 - now.getHours());
  return { id: goal.id, todayTarget, hourlyTarget: Math.ceil(todayTarget / hoursRemaining), shortfall, daysRemaining };
}

function getOrderIntensity(openOrderCount, riderCount) {
  if (!riderCount) return { label: openOrderCount ? 'High' : 'Low', multiplier: openOrderCount ? 3 : 0.5 };
  const ratio = openOrderCount / riderCount;
  if (ratio > 3.5) return { label: 'Very High', multiplier: 1.4 };
  if (ratio > 2) return { label: 'High', multiplier: 1.2 };
  if (ratio >= 1) return { label: 'Normal', multiplier: 1 };
  return { label: 'Low', multiplier: 0.8 };
}
