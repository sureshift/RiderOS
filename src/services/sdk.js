// -- Supabase cloud database adapter --
import { supabaseAdapter } from './supabaseAdapter.js';

const coreSDK = {
  CoreSDK: {
    createClient: async (adapter) => adapter,
  }
};

export const sdk = await coreSDK.CoreSDK.createClient(supabaseAdapter);
