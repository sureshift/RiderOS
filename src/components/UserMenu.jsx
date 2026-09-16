import { useState } from 'react';
import { Link } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import ThemeToggle from '@/components/ThemeToggle';

export default function UserMenu({ user, initials, displayName, logout }) {
  const [open, setOpen] = useState(false);
  return <div className="relative">
    <button onClick={() => setOpen(!open)} className="flex items-center gap-3 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={open}>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{initials || 'R'}</span>
      <span className="hidden text-left sm:block"><strong className="block text-sm">{displayName || 'Rider'}</strong><small className="text-muted-foreground">Personal account</small></span><ApperIcon name="ChevronDown" />
    </button>
    {open && <div className="absolute right-0 top-14 z-50 w-64 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="mb-3 border-b border-border px-2 pb-3"><strong>{displayName}</strong><p className="text-xs text-muted-foreground">{user?.email || 'Rider account'}</p></div>
      <div className="px-2 pb-3"><small className="mb-2 block text-muted-foreground">Appearance</small><ThemeToggle className="w-full" /></div>
      <Link to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Settings" /> Settings</Link>
      <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-destructive hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="LogOut" /> Sign out</button>
    </div>}
  </div>;
}
