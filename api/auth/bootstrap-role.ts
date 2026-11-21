import { handleAuthBootstrapRole, type ApiRequest, type ApiResponse } from '../../lib/serverHandlers';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await handleAuthBootstrapRole(req, res);
}
