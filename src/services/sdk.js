// -- Local database adapter --
import { localAdapter } from './localAdapter.js';

const dummyCoreSDK = {
  CoreSDK: {
    createClient: async (adapter) => adapter,
  }
};

export const sdk = await dummyCoreSDK.CoreSDK.createClient(localAdapter);
