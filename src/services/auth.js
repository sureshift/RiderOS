import { loginUser, registerUser } from './localDb';

let currentUser = null;
const subscribers = [];

export { loginUser, registerUser };

export function subscribe(callback) {
  subscribers.push(callback);
  return () => {
    const idx = subscribers.indexOf(callback);
    if (idx > -1) subscribers.splice(idx, 1);
  };
}

function notifySubscribers() {
  subscribers.forEach(cb => cb({ user: currentUser, status: currentUser ? 'authenticated' : 'anonymous' }));
}

export async function login(email, password) {
  const user = await loginUser(email, password);
  if (user) {
    currentUser = user;
    localStorage.setItem('auth_user', JSON.stringify(user));
    notifySubscribers();
    return user;
  }
  return null;
}

export async function signup(email, password, name) {
  const user = await registerUser(email, password, name);
  if (user) {
    currentUser = user;
    localStorage.setItem('auth_user', JSON.stringify(user));
    notifySubscribers();
    return user;
  }
  return null;
}

export async function logout() {
  currentUser = null;
  localStorage.removeItem('auth_user');
  notifySubscribers();
}

export function getCurrentUser() {
  if (currentUser) return currentUser;
  const stored = localStorage.getItem('auth_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      return currentUser;
    } catch {
      localStorage.removeItem('auth_user');
    }
  }
  return null;
}

export function initializeAuth() {
  getCurrentUser();
  notifySubscribers();
}
