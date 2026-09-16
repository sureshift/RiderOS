import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import ApperIcon from '@/components/ApperIcon';
import { downloadDatabase, exportDatabase, importDatabase } from '@/services/localDb';

export const route = { path: '/settings', layout: 'owner', access: 'public' };
export const nav = { icon: 'Settings2', label: 'Settings & backup', section: 'System', order: 7 };

const UPI_KEY = 'rideros.upi.settings';
const DRIVE_KEY = 'rideros.drive.client';

export default function Settings() {
  const [upi, setUpi] = useState({ vpa: '', payee: '', amount: '' });
  const [driveClientId, setDriveClientId] = useState('');
  const [driveToken, setDriveToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const storedUpi = localStorage.getItem(UPI_KEY);
    const storedDrive = localStorage.getItem(DRIVE_KEY);
    if (storedUpi) setUpi(JSON.parse(storedUpi));
    if (storedDrive) setDriveClientId(storedDrive);
  }, []);

  const paymentUri = upi.vpa
    ? `upi://pay?${new URLSearchParams({ pa: upi.vpa, pn: upi.payee || 'Delivery', cu: 'INR', ...(upi.amount ? { am: Number(upi.amount).toFixed(2) } : {}) }).toString()}`
    : '';

  function saveUpi(event) {
    event.preventDefault();
    if (!/^[-\w.@]{2,256}$/.test(upi.vpa)) { setMessage('Enter a valid UPI ID such as name@indus.'); return; }
    localStorage.setItem(UPI_KEY, JSON.stringify(upi));
    setMessage('UPI receive details saved on this device.');
  }

  async function backup() {
    setBusy(true);
    try { downloadDatabase(await exportDatabase()); setMessage('SQLite backup downloaded. Keep it somewhere separate from the device.'); }
    catch (err) { setMessage(err.message || 'Backup failed.'); }
    finally { setBusy(false); }
  }

  async function restore(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!window.confirm('Restore this SQLite file? The current local database will be replaced.')) return;
    setBusy(true);
    try { await importDatabase(file); setMessage('SQLite database restored. Reload the app to refresh every screen.'); }
    catch (err) { setMessage(err.message || 'Restore failed.'); }
    finally { setBusy(false); }
  }

  function saveDriveClient() {
    localStorage.setItem(DRIVE_KEY, driveClientId.trim());
    setMessage(driveClientId.trim() ? 'Google Drive client ID saved.' : 'Google Drive client ID cleared.');
  }

  async function connectDrive() {
    if (!driveClientId.trim()) {
      setMessage('Save your Google OAuth web client ID first.');
      return;
    }
    setBusy(true);
    try {
      await loadGoogleIdentityServices();
      await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: driveClientId.trim(),
          scope: 'https://www.googleapis.com/auth/drive.appdata',
          callback: response => response.error ? reject(new Error(response.error_description || 'Google authorization failed.')) : resolve(response.access_token)
        });
        client.callback = response => response.error ? reject(new Error(response.error_description || 'Google authorization failed.')) : (setDriveToken(response.access_token), resolve());
        client.requestAccessToken();
      });
      setMessage('Google Drive connected for this browser session.');
    } catch (err) {
      setMessage(err.message || 'Could not connect Google Drive.');
    } finally {
      setBusy(false);
    }
  }

  async function backupToDrive() {
    if (!driveToken) {
      await connectDrive();
      return;
    }
    setBusy(true);
    try {
      const bytes = await exportDatabase();
      const metadata = { name: `rideros-${new Date().toISOString().replaceAll(':', '-')}.sqlite`, parents: ['appDataFolder'] };
      const boundary = `rideros_${crypto.randomUUID()}`;
      const body = new Blob([
        `--${boundary}\\r\\nContent-Type: application/json; charset=UTF-8\\r\\n\\r\\n${JSON.stringify(metadata)}\\r\\n`,
        `--${boundary}\\r\\nContent-Type: application/x-sqlite3\\r\\n\\r\\n`,
        bytes,
        `\\r\\n--${boundary}--`
      ], { type: `multipart/related; boundary=${boundary}` });
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime', {
        method: 'POST',
        headers: { Authorization: `Bearer ${driveToken}` },
        body
      });
      if (!response.ok) throw new Error('Google Drive rejected the backup upload. Reconnect and try again.');
      setMessage('SQLite backup uploaded to your private Google Drive app-data folder.');
    } catch (err) {
      setMessage(err.message || 'Google Drive backup failed.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-5xl space-y-6"><header><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">Private device setup</p><h1 className="font-heading text-5xl font-bold">Settings & backup</h1><p className="mt-2 text-muted-foreground">Your working database is SQLite on this device. Cloud backup is optional.</p></header>
    {message && <div role="status" className="rounded-xl bg-muted p-3 text-sm">{message}</div>}
    <section className="grid gap-6 lg:grid-cols-[1fr_.85fr]"><form onSubmit={saveUpi} className="space-y-4 rounded-3xl border border-border bg-card p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><ApperIcon name="QrCode" /></span><div><h2 className="font-heading text-3xl font-bold">IndusInd UPI</h2><p className="text-sm text-muted-foreground">Generate a real UPI intent QR for your receive VPA.</p></div></div><label className="text-sm font-semibold">UPI ID / VPA<input required value={upi.vpa} onChange={event => setUpi({ ...upi, vpa: event.target.value })} placeholder="yourname@indus" className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><label className="text-sm font-semibold">Payee name<input value={upi.payee} onChange={event => setUpi({ ...upi, payee: event.target.value })} placeholder="Your name or business" className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><label className="text-sm font-semibold">Fixed amount ₹<input type="number" min="0" step="0.01" value={upi.amount} onChange={event => setUpi({ ...upi, amount: event.target.value })} placeholder="Optional" className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><button className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Save UPI details</button><p className="text-xs leading-relaxed text-muted-foreground">This creates a standards-based UPI intent QR. It does not verify settlement or create a bank-issued dynamic QR. Payment confirmation must still come from your banking app or an authorized IndusInd integration.</p></form>
      <div className="rounded-3xl border border-border bg-card p-6"><h2 className="font-heading text-3xl font-bold">Show QR</h2>{paymentUri ? <div className="mt-5 grid justify-items-center gap-4"><div className="rounded-2xl bg-background p-5 shadow-(--shadow-sm)"><QRCodeCanvas value={paymentUri} size={240} includeMargin /></div><p className="break-all text-center font-mono text-xs text-muted-foreground">{paymentUri}</p><button onClick={() => navigator.clipboard?.writeText(paymentUri)} className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-3 font-bold text-secondary-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ApperIcon name="Copy" /> Copy UPI link</button></div> : <div className="grid min-h-72 place-items-center rounded-2xl bg-muted/60 p-6 text-center"><div><ApperIcon name="QrCode" className="mx-auto mb-3 text-muted-foreground" /><p className="text-sm text-muted-foreground">Save your UPI details to generate the QR.</p></div></div>}</div></section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-3xl border border-border bg-card p-6"><div className="mb-5 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><ApperIcon name="HardDrive" /></span><div><h2 className="font-heading text-3xl font-bold">SQLite backup</h2><p className="text-sm text-muted-foreground">WhatsApp-style local-first recovery: the device is primary, backup is secondary.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><button disabled={busy} onClick={backup} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50"><ApperIcon name="Download" /> Export SQLite</button><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 font-bold text-secondary-foreground hover:bg-accent"> <ApperIcon name="Upload" /> Restore SQLite<input type="file" accept=".sqlite,.db,application/x-sqlite3" onChange={restore} className="sr-only" /></label></div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">The exported file contains your local orders, trips, GPS events, goals, payment records and configuration data. Protect it like business data.</p></div>
      <div className="rounded-3xl border border-border bg-card p-6"><div className="mb-5 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><ApperIcon name="Cloud" /></span><div><h2 className="font-heading text-3xl font-bold">Optional Google Drive backup</h2><p className="text-sm text-muted-foreground">Use your own Google Drive. The app will not upload anything until you connect it.</p></div></div><label className="text-sm font-semibold">Google OAuth web client ID<input value={driveClientId} onChange={event => setDriveClientId(event.target.value)} placeholder="xxxxx.apps.googleusercontent.com" className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><div className="mt-3 grid gap-2 sm:grid-cols-2"><button onClick={saveDriveClient} className="rounded-xl bg-secondary px-4 py-3 font-bold text-secondary-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Save client ID</button><button disabled={busy || !driveClientId} onClick={connectDrive} className="rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50">{driveToken ? 'Drive connected' : 'Connect Drive'}</button></div><button disabled={busy || !driveToken} onClick={backupToDrive} className="mt-2 w-full rounded-xl bg-secondary px-4 py-3 font-bold text-secondary-foreground disabled:opacity-50"><ApperIcon name="CloudUpload" /> Backup SQLite to Drive</button><p className="mt-3 text-xs leading-relaxed text-muted-foreground">The app requests only Google Drive <span className="font-semibold">appDataFolder</span> access, uploads the SQLite file privately, and keeps the access token only in memory. Configure the OAuth client's authorized web origin to match this app.</p></div></div></section>
    <section className="rounded-3xl border border-border bg-card p-6"><h2 className="font-heading text-3xl font-bold">Privacy & device safety</h2><div className="mt-5 grid gap-3 md:grid-cols-3"><Setting icon="MapPin" title="GPS" text="Only capture when a delivery milestone is advanced." /><Setting icon="Database" title="SQLite" text="The operational database stays on this device until you export or back it up." /><Setting icon="ShieldCheck" title="No OTP" text="This private build does not depend on SMS OTP or delivery-platform APIs." /></div></section>
  </div>;
}

function Setting({ icon, title, text }) { return <div className="rounded-2xl bg-muted/60 p-4"><span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ApperIcon name={icon} /></span><strong>{title}</strong><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div>; }
