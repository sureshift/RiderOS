import Dashboard from './Dashboard';
export const route = { path: '/', layout: 'owner', access: 'authenticated' };
export default function Home() { return <Dashboard />; }
