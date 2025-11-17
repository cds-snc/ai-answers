// VectorServiceFactory.js
import { Setting } from '../models/setting.js';
import dbConnect from '../api/db/db-connect.js';
import IMVectorService from './IMVectorService.js';
import DocDBVectorService from './DocDBVectorService.js';
import ServerLoggingService from './ServerLoggingService.js';

let VectorService = null;

export async function initVectorService() {
  // If already initialized, return the existing instance (idempotent)
  if (VectorService) {
    try {
      ServerLoggingService.debug('initVectorService called but VectorService is already initialized');
    } catch (e) {
      // ignore logging errors
    }
    return VectorService;
  }

  await dbConnect();
  const setting = await Setting.findOne({ key: 'vectorServiceType' });
  const type = setting?.value || 'imvectordb';
  VectorService = type === 'documentdb' ? new DocDBVectorService() : new IMVectorService();
  await VectorService.initialize();
  return VectorService;
}

export { VectorService };
