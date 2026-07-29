import dbConnect from '../db/db-connect.js';
import { normalizeObjectIdString } from '../util/db-query.js';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataBackfillJobService from '../../services/EmbeddingMetadataBackfillJobService.js';

async function vectorMetadataBackfillJobHandler(req, res) {
  try {
    await dbConnect();

    if (req.method === 'GET') {
      return res.status(200).json({ job: await EmbeddingMetadataBackfillJobService.getLatest() });
    }

    if (req.method === 'POST') {
      const {
        phase = 'missing',
        resumeJobId = null,
        restartJobId = null,
        delaySeconds = 5,
      } = req.body || {};
      const parsedDelaySeconds = Number(delaySeconds);
      if (!Number.isFinite(parsedDelaySeconds) || parsedDelaySeconds < 0 || parsedDelaySeconds > 300) {
        return res.status(400).json({ error: 'delaySeconds must be between 0 and 300' });
      }
      const normalizedResumeJobId = resumeJobId
        ? normalizeObjectIdString(resumeJobId)
        : null;
      if (resumeJobId && !normalizedResumeJobId) {
        return res.status(400).json({ error: 'Invalid resumeJobId' });
      }
      const normalizedRestartJobId = restartJobId
        ? normalizeObjectIdString(restartJobId)
        : null;
      if (restartJobId && !normalizedRestartJobId) {
        return res.status(400).json({ error: 'Invalid restartJobId' });
      }
      if (normalizedResumeJobId && normalizedRestartJobId) {
        return res.status(400).json({ error: 'Choose either resumeJobId or restartJobId' });
      }

      const job = await EmbeddingMetadataBackfillJobService.start({
        phase: phase === 'interactions' ? 'interactions' : 'missing',
        resumeJobId: normalizedResumeJobId,
        restartJobId: normalizedRestartJobId,
        delayMs: Math.round(parsedDelaySeconds * 1000),
      });
      return res.status(202).json({ job });
    }

    if (req.method === 'DELETE') {
      const rawJobId = req.body?.jobId || null;
      const jobId = rawJobId ? normalizeObjectIdString(rawJobId) : null;
      if (rawJobId && !jobId) {
        return res.status(400).json({ error: 'Invalid jobId' });
      }
      return res.status(200).json({ job: await EmbeddingMetadataBackfillJobService.stop(jobId) });
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error) {
    console.error('Embedding metadata backfill job error:', error);
    return res.status(500).json({
      error: 'Failed to manage embedding metadata backfill job',
      details: error.message,
    });
  }
}

export default withProtection(vectorMetadataBackfillJobHandler, authMiddleware, adminMiddleware);
