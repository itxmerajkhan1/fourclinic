import { handleAuthBootstrapRole, type ApiRequest, type ApiResponse } from '../../lib/serverHandlers.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await handleAuthBootstrapRole(req, res);
}
