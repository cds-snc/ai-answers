import { UrlValidationService } from '../../services/UrlValidationService.js';

export default async function handler(req, res) {
  const { url, chatId } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const result = await UrlValidationService.validateUrl(url, chatId);

  return res.status(200).json(result);
}

// Keep export for tests that might import it
export const __private__ = UrlValidationService.__private__;
