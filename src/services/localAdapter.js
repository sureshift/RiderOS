import { query, insert, update, remove } from './localDb';

export class LocalAdapter {
  async select(tableName, fields, filters = []) {
    let sql = `SELECT * FROM ${tableName}`;
    const params = [];

    if (filters.length > 0) {
      const where = filters.map((f) => {
        if (f.operator === 'Equal') {
          params.push(f.value);
          return `${f.field} = ?`;
        }
        if (f.operator === 'In') {
          const placeholders = f.value.map(() => '?');
          params.push(...f.value);
          return `${f.field} IN (${placeholders.join(',')})`;
        }
        if (f.operator === 'Like') {
          params.push(`%${f.value}%`);
          return `${f.field} LIKE ?`;
        }
        return '1=1';
      });
      sql += ` WHERE ${where.join(' AND ')}`;
    }

    const rows = await query(sql, params);
    return {
      success: true,
      data: rows,
      total: rows.length,
      hasMore: false,
    };
  }

  async get(tableName, id) {
    const rows = await query(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
    return {
      success: true,
      data: rows[0] || null,
    };
  }

  async create(tableName, record) {
    const created = await insert(tableName, record);
    return {
      success: true,
      data: [created],
      messages: [],
    };
  }

  async update(tableName, recordId, values) {
    const updated = await update(tableName, recordId, values);
    return {
      success: true,
      data: [updated],
      messages: [],
    };
  }

  async delete(tableName, id) {
    await remove(tableName, id);
    return {
      success: true,
      data: [],
      messages: [],
    };
  }
}

export const localAdapter = {
  session: {
    user: () => {
      const stored = localStorage.getItem('auth_user');
      return stored ? JSON.parse(stored) : null;
    },
    subscribe: (callback) => {
      window.addEventListener('storage', () => callback({ status: 'anonymous', user: null }));
      return () => {};
    },
    logout: async () => {
      localStorage.removeItem('auth_user');
    },
    login: async ({ email, password }) => {
      const { loginUser } = await import('./localDb');
      const user = await loginUser(email, password);
      if (user) {
        localStorage.setItem('auth_user', JSON.stringify(user));
        return { ok: true, value: user };
      }
      return { ok: false, error: { message: 'Invalid email or password' } };
    },
    register: async ({ email, password }) => {
      const { registerUser } = await import('./localDb');
      try {
        const user = await registerUser(email, password, email);
        if (user) {
          localStorage.setItem('auth_user', JSON.stringify(user));
          return { ok: true, value: user };
        }
      } catch (err) {
        return { ok: false, error: { message: err.message || 'Registration failed' } };
      }
      return { ok: false, error: { message: 'Registration failed' } };
    },
  },
  table: (name) => ({
    select: (fields) => ({
      where: (filter) => ({
        fetch: async () => {
          const adapter = new LocalAdapter();
          return adapter.select(name, fields, filter ? [filter] : []);
        },
      }),
      fetch: async () => {
        const adapter = new LocalAdapter();
        return adapter.select(name, fields);
      },
      get: async (id) => {
        const adapter = new LocalAdapter();
        return adapter.get(name, id);
      },
    }),
  }),
  storage: {
    toCreateFormat: (files) => files,
    toUpdateFormat: (files) => files,
  },
};
