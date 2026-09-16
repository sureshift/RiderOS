import { useEffect, useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { downloadDatabase, exportDatabase, importDatabase } from '@/services/localDb';

export const route = { path: '/settings', layout: 'owner', access: 'public' };
export const nav = { icon: 'Settings2', label: 'Settings & backup', section: 'System', order: 7 };

const SLICE_KEY = 'rideros.slice.account';
const DRIVE_KEY = 'rideros.drive.client';

export default function Settings() {
  const [sliceAccount, setSliceAccount] = useState({ vpa: '', payee: '' });
  const [driveClientId, setDriveClientId] = useState('');
  const [driveToken, setDriveToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const storedSlice = localStorage.getItem(SLICE_KEY);
    const storedDrive = localStorage.getItem(DRIVE_KEY);
    if (storedSlice) setSliceAccount(JSON.parse(storedSlice));
    if (storedDrive) setDriveClientId(storedDrive);
  }, []);

  function saveSliceAccount(event) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+$/.test(sliceAccount.vpa.trim())) {
      setMessage('Enter the Slice-linked UPI ID used to receive COD payments.');
      return;
    }
    localStorage.setItem(SLICE_KEY, JSON.stringify({ vpa: sliceAccount.vpa.trim(), payee: sliceAccount.payee.trim() }));
    setMessage('Slice receive details saved on this device. COD QR codes will use these details.');
  }

  async function backup() {
    setBusy(true);
    try {
      downloadDatabase(await exportDatabase());
      setMessage('SQLite backup downloaded. Keep it somewhere separate from the device.');
    } catch (err) {
      setMessage(err.message || 'Backup failed.');
    } finally {
      setBusy(false);
    }
  }

  async function restore(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!window.confirm('Restore this SQLite file? The current local database will be replaced.')) return;
    setBusy(true);
    try {
      await importDatabase(file);
      setMessage('SQLite database restored. Reload the app to refresh every screen.');
    } catch (err) {
      setMessage(err.message || 'Restore failed.');
    } finally {
      setBusy(false);
    }
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
          callback: response => {
            if (response.error) {
              reject(new Error(response.error_description || 'Google authorization failed.'));
              return;
            }
            setDriveToken(response.access_token);
            resolve();
          }
        });
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
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: application/x-sqlite3\r\n\r\n`,
        bytes,
        `\r\n--${boundary}--`
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
    <section className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><ApperIcon name="WalletCards" /></span><div><h2 className="font-heading text-3xl font-bold">Slice account details</h2><p className="text-sm text-muted-foreground">Store the Slice-linked UPI ID that riders will use to collect COD payments.</p></div></div><form onSubmit={saveSliceAccount} className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">Slice UPI ID / VPA<input required value={sliceAccount.vpa} onChange={event => setSliceAccount({ ...sliceAccount, vpa: event.target.value })} placeholder="yourname@upi" className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><label className="text-sm font-semibold">Account / payee name<input value={sliceAccount.payee} onChange={event => setSliceAccount({ ...sliceAccount, payee: event.target.value })} placeholder="Your business name" className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><div className="md:col-span-2"><button className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Save Slice details</button><p className="mt-3 text-xs leading-relaxed text-muted-foreground">The app creates an amount-specific UPI QR locally when a COD order is opened in Live Run. It does not call the Slice API or claim to verify bank settlement automatically. The rider marks the amount received only after confirming the payment in the Slice/banking app.</p></div></form></section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-3xl border border-border bg-card p-6"><div className="mb-5 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><ApperIcon name="HardDrive" /></span><div><h2 className="font-heading text-3xl font-bold">SQLite backup</h2><p className="text-sm text-muted-foreground">WhatsApp-style local-first recovery: the device is primary, backup is secondary.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><button disabled={busy} onClick={backup} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50"><ApperIcon name="Download" /> Export SQLite</button><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 font-bold text-secondary-foreground hover:bg-accent"> <ApperIcon name="Upload" /> Restore SQLite<input type="file" accept=".sqlite,.db,application/x-sqlite3" onChange={restore} className="sr-only" /></label></div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">The exported file contains your local orders, trips, GPS events, goals, payment records and configuration data. Protect it like business data.</p></div>
      <div className="rounded-3xl border border-border bg-card p-6"><div className="mb-5 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><ApperIcon name="Cloud" /></span><div><h2 className="font-heading text-3xl font-bold">Optional Google Drive backup</h2><p className="text-sm text-muted-foreground">Use your own Google Drive. The app will not upload anything until you connect it.</p></div></div><label className="text-sm font-semibold">Google OAuth web client ID<input value={driveClientId} onChange={event => setDriveClientId(event.target.value)} placeholder="xxxxx.apps.googleusercontent.com" className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><div className="mt-3 grid gap-2 sm:grid-cols-2"><button onClick={saveDriveClient} className="rounded-xl bg-secondary px-4 py-3 font-bold text-secondary-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Save client ID</button><button disabled={busy || !driveClientId} onClick={connectDrive} className="rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50">{driveToken ? 'Drive connected' : 'Connect Drive'}</button></div><button disabled={busy || !driveToken} onClick={backupToDrive} className="mt-2 w-full rounded-xl bg-secondary px-4 py-3 font-bold text-secondary-foreground disabled:opacity-50"><ApperIcon name="CloudUpload" /> Backup SQLite to Drive</button><p className="mt-3 text-xs leading-relaxed text-muted-foreground">The app requests only Google Drive <span className="font-semibold">appDataFolder</span> access, uploads the SQLite file privately, and keeps the access token only in memory. Configure the OAuth client's authorized web origin to match this app.</p></div></section>
    <section className="rounded-3xl border border-border bg-card p-6"><h2 className="font-heading text-3xl font-bold">Privacy & device safety</h2><div className="mt-5 grid gap-3 md:grid-cols-3"><Setting icon="MapPin" title="GPS" text="Only capture when a delivery milestone is advanced." /><Setting icon="Database" title="SQLite" text="The operational database stays on this device until you export or back it up." /><Setting icon="ShieldCheck" title="No OTP" text="This private build does not depend on SMS OTP or delivery-platform APIs." /></div></section>
  </div>;
}

function Setting({ icon, title, text }) { return <div className="rounded-2xl bg-muted/60 p-4"><span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ApperIcon name={icon} /></span><strong>{title}</strong><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div>; }

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity-services]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity Services could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentityServices = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Google Identity Services could not be loaded.'));
    document.head.appendChild(script);
  });
}
