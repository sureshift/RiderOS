import { supabase } from './supabaseClient';

let currentUser = null;
const subscribers = new Set();
const normalizeUser = (user) => user ? ({ id: user.id, email: user.email, name: user.user_metadata?.name || user.email?.split('@')[0] || 'Rider', profile: 'rider' }) : null;

function notifySubscribers() {
  const payload = { user: currentUser, status: currentUser ? 'authenticated' : 'anonymous' };
  subscribers.forEach((callback) => callback(payload));
}

export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  currentUser = normalizeUser(data.user);
  notifySubscribers();
  return currentUser;
}

export async function registerUser(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: (name || email.split('@')[0]).trim() } },
  });
  if (error) throw error;
  currentUser = normalizeUser(data.user);
  notifySubscribers();
  return currentUser;
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentUser = null;
  notifySubscribers();
}

export async function login(email, password) { return loginUser(email, password); }
export async function signup(email, password, name) { return registerUser(email, password, name); }
export const logout = logoutUser;

export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function getCurrentUser() { return currentUser; }

export async function initializeAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  currentUser = normalizeUser(data.session?.user ?? null);
  notifySubscribers();
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = normalizeUser(session?.user ?? null);
    notifySubscribers();
  });
  return currentUser;
}
