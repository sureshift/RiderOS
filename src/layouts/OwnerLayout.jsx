import { NavLink, Link, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useOwnerLayoutData } from '@/hooks/useOwnerLayoutData';
import UserMenu from '@/components/UserMenu';
import ApperIcon from '@/components/ApperIcon';
import { ErrorBoundary } from '@/components/ui/error-boundary';

const nav = [
  { to: '/dashboard', label: 'Cockpit', icon: 'Gauge' },
  { to: '/live-run', label: 'Live run', icon: 'Route' },
  { to: '/orders', label: 'Order history', icon: 'PackageCheck' },
  { to: '/places', label: 'Places', icon: 'MapPin' },
  { to: '/goals', label: 'Goals & money', icon: 'Wallet' },
  { to: '/insights', label: 'Insights', icon: 'ChartNoAxesCombined' },
  { to: '/settings', label: 'Settings & QR', icon: 'Settings2' },
];

export default function OwnerLayout() {
  const { user, logout, homeRoute, initials, displayName } = useOwnerLayoutData();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-sidebar-border bg-sidebar p-5 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Link to={homeRoute} className="mb-8 flex items-center gap-3 rounded-2xl px-2 py-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground"><ApperIcon name="MapPinned" /></span>
          <span><strong className="block font-heading text-2xl tracking-wide">RIDEROS</strong><small className="text-sidebar-foreground/70">Shift intelligence</small></span>
        </Link>
        <div className="mb-3 px-3 text-xs font-bold uppercase tracking-[.18em] text-muted-foreground">Your workspace</div>
        <nav className="space-y-1">
          {nav.map(item => <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground'}`}><ApperIcon name={item.icon} /><span>{item.label}</span></NavLink>)}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-sidebar-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold"><span className="h-2 w-2 rounded-full bg-success"/> Rider mode</div>
          <p className="text-xs leading-relaxed text-muted-foreground">Log each milestone. Let your shift data do the thinking.</p>
        </div>
      </aside>
      {menuOpen && <button aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:px-8">
          <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" className="rounded-lg p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"><ApperIcon name="Menu" /></button>
          <div className="hidden text-xs font-bold uppercase tracking-[.18em] text-muted-foreground md:block">Rider workspace / Delhi NCR</div>
          <UserMenu user={user} initials={initials} displayName={displayName} logout={logout} />
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 md:p-8"><ErrorBoundary><Outlet /></ErrorBoundary></main>
      </div>
    </div>
  );
}
