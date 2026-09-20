import { supabase } from './supabaseClient';

const TABLES = new Set(['profiles','platforms','places','riders','orders','trips','trip_orders','gps_events','goals','payments']);
function assertTable(name) { if (!TABLES.has(name)) throw new Error(`Unsupported Supabase table: ${name}`); }
function applyFilters(query, filters = []) {
  for (const filter of filters) {
    if (!filter) continue;
    if (filter.operator === 'Equal') query = query.eq(filter.field, filter.value);
    else if (filter.operator === 'In') query = query.in(filter.field, filter.value);
    else if (filter.operator === 'Like') query = query.ilike(filter.field, `%${filter.value}%`);
  }
  return query;
}
function unwrap({ data, error }) { if (error) throw error; return data; }

export class SupabaseAdapter {
  async select(tableName, fields = [], filters = []) {
    assertTable(tableName);
    let query = supabase.from(tableName).select(fields?.length ? fields.map(f => f.field || f).join(',') : '*');
    query = applyFilters(query, filters);
    const data = unwrap(await query);
    return { success: true, data: data || [], total: data?.length || 0, hasMore: false };
  }
  async get(tableName, id) {
    assertTable(tableName);
    const data = unwrap(await supabase.from(tableName).select('*').eq('id', id).maybeSingle());
    return { success: true, data: data || null };
  }
  async create(tableName, record) {
    assertTable(tableName);
    const data = unwrap(await supabase.from(tableName).insert(record).select().single());
    return { success: true, data: [data], messages: [] };
  }
  async update(tableName, recordId, values) {
    assertTable(tableName);
    const data = unwrap(await supabase.from(tableName).update({ ...values, updated_at: new Date().toISOString() }).eq('id', recordId).select().maybeSingle());
    return { success: true, data: data ? [data] : [], messages: [] };
  }
  async delete(tableName, id) {
    assertTable(tableName);
    unwrap(await supabase.from(tableName).delete().eq('id', id));
    return { success: true, data: [], messages: [] };
  }
}

export const supabaseAdapter = {
  session: {
    user: async () => (await supabase.auth.getUser()).data.user,
    subscribe: callback => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => callback({ status: session ? 'authenticated' : 'anonymous', user: session?.user ?? null }));
      return () => subscription.unsubscribe();
    },
    logout: async () => unwrap(await supabase.auth.signOut()),
    login: async ({ email, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      return error ? { ok: false, error } : { ok: true, value: data.user };
    },
    register: async ({ email, password }) => {
      const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password });
      return error ? { ok: false, error } : { ok: true, value: data.user };
    },
  },
  table: name => ({
    select: fields => ({
      where: filter => ({ fetch: async () => new SupabaseAdapter().select(name, fields, filter ? [filter] : []) }),
      fetch: async () => new SupabaseAdapter().select(name, fields),
      get: async id => new SupabaseAdapter().get(name, id),
    }),
  }),
  storage: { toCreateFormat: files => files, toUpdateFormat: files => files },
};
