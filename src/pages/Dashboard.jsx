import { useFetch } from '@/hooks/useFetch';
import { sdk } from '@/services/sdk';
import { Link } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { formatLocalDate } from '@/utils/date';

export const route = { path: '/dashboard', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'Gauge', label: 'Cockpit', section: 'Shift', order: 1 };
const ORDER_FIELDS = ['Name', 'platform_c', 'orderCode_c', 'phase_c', 'earning_c', 'distanceKm_c', 'minutes_c', 'CreatedOn'];
const GOAL_FIELDS = ['Name', 'target_c', 'saved_c', 'deadline_c', 'active_c'];

export default function Dashboard() {
  const { data: orders, loading, error, run } = useFetch(async () => {
    const r = await sdk.table('orders_c').select(ORDER_FIELDS).orderByDesc('CreatedOn').page(1, 50).fetch();
    if (!r.success) throw new Error(r.message);
    return r.data ?? [];
  }, []);
  const { data: goals } = useFetch(async () => {
    const r = await sdk.table('goals_c').select(GOAL_FIELDS).orderByDesc('CreatedOn').page(1, 20).fetch();
    if (!r.success) throw new Error(r.message);
    return r.data ?? [];
  }, []);
  const rows = orders ?? [];
  const delivered = rows.filter(o => o.phase_c === 'Delivered');
  const active = rows.filter(o => !['Delivered', 'Cancelled'].includes(o.phase_c));
  const todayEarnings = delivered.reduce((sum, o) => sum + Number(o.earning_c || 0), 0);
  const goalRows = (goals ?? []).filter(g => g.active_c);
  const progress = goalRows.length ? Math.round(goalRows.reduce((s, g) => s + Math.min(1, Number(g.saved_c || 0) / Math.max(1, Number(g.target_c || 1))), 0) / goalRows.length * 100) : 0;
  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-[2rem] bg-primary p-6 text-primary-foreground md:p-9">
      <div className="absolute -right-8 -top-16 h-64 w-64 rounded-full border-[35px] border-primary-foreground/10" />
      <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-bold uppercase tracking-widest"><span className="h-2 w-2 rounded-full bg-success"/> Rider cockpit</div><h1 className="font-heading text-5xl font-bold leading-none md:text-7xl">Own your<br/>whole shift.</h1><p className="mt-4 max-w-lg text-primary-foreground/80">Every platform. Every stop. Every rupee. Start a run and let RiderOS turn your day into useful data.</p></div><Link to="/live-run" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-bold text-accent-foreground shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">Start / manage run <ApperIcon name="ArrowUpRight" /></Link></div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Today's tracked earnings" value={`₹${todayEarnings.toLocaleString('en-IN')}`} detail={`${delivered.length} completed deliveries`} icon="IndianRupee" />
      <Metric label="Orders in motion" value={active.length} detail="Across your platforms" icon="Package" emphasis />
      <Metric label="Completed today" value={delivered.length} detail="Based on tracked orders" icon="CheckCircle2" />
      <Metric label="Goal progress" value={`${progress}%`} detail={`${goalRows.length} active money goals`} icon="Target" />
    </section>
    <section className="grid gap-6 xl:grid-cols-[1.35fr_.85fr]">
      <div className="rounded-3xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-heading text-3xl font-bold">Orders in motion</h2><p className="text-sm text-muted-foreground">A live snapshot of your open work</p></div><Link to="/orders" className="text-sm font-bold text-primary hover:underline">All orders →</Link></div>
        {loading ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div> : error ? <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error.message}<button onClick={run} className="ml-3 underline">Retry</button></div> : active.length === 0 ? <Empty icon="PackageOpen" text="No active orders. Start a run when you accept your next delivery." href="/live-run" action="Open live run" /> : <div className="space-y-3">{active.map(order => <div key={order.Id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ApperIcon name="Package" /></span><div><strong className="block">{order.orderCode_c || order.Name}</strong><span className="text-xs text-muted-foreground">{order.platform_c?.Name} · {order.phase_c}</span></div></div><div className="text-right"><strong>₹{Number(order.earning_c || 0).toFixed(0)}</strong><p className="text-xs text-muted-foreground">{order.distanceKm_c || 0} km est.</p></div></div>)}</div>}
      </div>
      <div className="rounded-3xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-heading text-3xl font-bold">Money missions</h2><p className="text-sm text-muted-foreground">Your goals, moving forward</p></div><Link to="/goals" className="text-sm font-bold text-primary hover:underline">Manage →</Link></div>
        {(goals ?? []).filter(g => g.active_c).length === 0 ? <Empty icon="Target" text="Set a target and choose how earnings should be allocated." href="/goals" action="Create a goal" /> : <div className="space-y-5">{(goals ?? []).filter(g => g.active_c).map(goal => { const pct = Math.min(100, Math.round(Number(goal.saved_c || 0) / Math.max(1, Number(goal.target_c || 1)) * 100)); return <div key={goal.Id}><div className="mb-2 flex justify-between gap-3"><strong>{goal.Name}</strong><span className="text-sm font-bold">{pct}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>₹{Number(goal.saved_c || 0).toLocaleString('en-IN')} saved</span><span>₹{Number(goal.target_c || 0).toLocaleString('en-IN')} target</span></div></div>; })}</div>}
      </div>
    </section>
    <section className="grid gap-4 md:grid-cols-3"><QuickLink href="/places" icon="MapPinned" title="Pickup places" text="Keep hubs, restaurants and dark stores organized."/><QuickLink href="/insights" icon="ChartNoAxesCombined" title="Shift intelligence" text="Find your productive hours and stronger zones."/><QuickLink href="/settings" icon="QrCode" title="Your UPI QR" text="Keep your receive-payment QR ready to show."/></section>
  </div>;
}
function Metric({ label, value, detail, icon, emphasis }) { return <div className={`rounded-3xl border p-5 ${emphasis ? 'border-primary bg-secondary/70' : 'border-border bg-card'}`}><div className="mb-4 flex items-center justify-between"><span className="text-sm font-semibold text-muted-foreground">{label}</span><ApperIcon name={icon} className="text-primary" /></div><div className="font-heading text-4xl font-bold">{value}</div><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function Empty({ icon, text, href, action }) { return <div className="grid justify-items-center rounded-2xl border border-dashed border-border p-7 text-center"><ApperIcon name={icon} className="mb-3 text-muted-foreground"/><p className="mb-4 max-w-xs text-sm text-muted-foreground">{text}</p><Link to={href} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{action}</Link></div>; }
function QuickLink({ href, icon, title, text }) { return <Link to={href} className="group rounded-3xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="mb-3 flex items-center justify-between"><ApperIcon name={icon} className="text-primary"/><ApperIcon name="ArrowUpRight" className="text-muted-foreground transition group-hover:text-primary"/></div><h3 className="font-heading text-2xl font-bold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></Link>; }
