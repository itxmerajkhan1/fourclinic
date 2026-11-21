import { handleHealth, type ApiRequest, type ApiResponse } from '../lib/serverHandlers';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await handleHealth(req, res);
}
