import { handleAuthVerify, type ApiRequest, type ApiResponse } from '../../lib/serverHandlers';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await handleAuthVerify(req, res);
}
