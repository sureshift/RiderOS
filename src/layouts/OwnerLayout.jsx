import { NavLink, Link, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useOwnerLayoutData } from '@/hooks/useOwnerLayoutData';
import UserMenu from '@/components/UserMenu';
import ApperIcon from '@/components/ApperIcon';
import { ErrorBoundary } from '@/components/ui/error-boundary';

const nav = [
  { to: '/dashboard', label: 'Overview', icon: 'LayoutDashboard' },
  { to: '/orders', label: 'Orders', icon: 'Package' },
  { to: '/live-run', label: 'Live operations', icon: 'Radar' },
  { to: '/places', label: 'Network', icon: 'MapPinned' },
  { to: '/insights', label: 'Analytics', icon: 'ChartNoAxesCombined' },
  { to: '/goals', label: 'Earnings goals', icon: 'WalletCards' },
  { to: '/settings', label: 'Settings & QR', icon: 'Settings2' },
];

export default function OwnerLayout() {
  const { user, logout, homeRoute, initials, displayName } = useOwnerLayoutData();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-sidebar-border bg-sidebar px-3 py-4 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Link to={homeRoute} className="mb-7 flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><ApperIcon name="Truck" /></span>
          <span><strong className="block font-heading text-2xl tracking-wide">RIDEROS</strong><small className="text-xs text-sidebar-foreground/70">Delivery control center</small></span>
        </Link>
        <div className="mb-2 px-3 text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Operations</div>
        <nav className="space-y-0.5">
          {nav.map(item => <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-(--shadow-xs)' : 'text-sidebar-foreground'}`}><ApperIcon name={item.icon} className="h-4 w-4" /><span>{item.label}</span></NavLink>)}
        </nav>
        <div className="absolute bottom-4 left-3 right-3 rounded-xl border border-sidebar-border bg-card p-3">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-bold"><span className="h-2 w-2 rounded-full bg-success"/> Local database online</div>
          <p className="text-xs leading-relaxed text-muted-foreground">SQLite is the source of truth on this device.</p>
        </div>
      </aside>
      {menuOpen && <button aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-7">
          <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" className="rounded-lg p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"><ApperIcon name="Menu" /></button>
          <div className="hidden md:block"><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Operations workspace</p><p className="text-sm font-semibold">Delhi NCR · Today</p></div>
          <UserMenu user={user} initials={initials} displayName={displayName} logout={logout} />
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4 md:p-7"><ErrorBoundary><Outlet /></ErrorBoundary></main>
      </div>
    </div>
  );
}
