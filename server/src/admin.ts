import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { User, Donation, Config, getRuntimeConfig, setRuntimeConfig, getQueuePrice, getSkipPrice } from './db';
import { getQueue, getCurrentItem, removeFromQueue, skipCurrent, getQueueLength, enqueue } from './queue';
import { getViewerCount } from './chat';
import { goLive, goOffline, getLiveState, checkMediaMTXStream, isMediaMTXAlive } from './liveMode';
import { Op, fn, col } from 'sequelize';
const router = Router();

// ── JWT Middleware ─────────────────────────────────────────

function verifyToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Authorization required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: number };
    (req as any).user = decoded;
    next();
  } catch {
    res.status(403).json({ message: 'Invalid or expired token' });
  }
}

// ── Login ─────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ where: { username } });
    if (!user || user.password !== password) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '24h' });
    res.json({ username: user.username, userId: user.id, token });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Stats ─────────────────────────────────────────────────

router.get('/stats', verifyToken, async (_req: Request, res: Response) => {
  try {
    const totalDonations = (await Donation.sum('value')) || 0;
    const donationCount = await Donation.count();
    const queueLength = getQueueLength();
    const viewers = getViewerCount();

    // Donations by date (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const donationsByDate = await Donation.findAll({
      attributes: [
        [fn('DATE', col('createdAt')), 'date'],
        [fn('SUM', col('value')), 'total'],
        [fn('COUNT', '*'), 'count'],
      ],
      where: {
        createdAt: { [Op.gte]: thirtyDaysAgo },
      },
      group: [fn('DATE', col('createdAt'))],
      order: [[fn('DATE', col('createdAt')), 'ASC']],
      raw: true,
    });

    const chartData = (donationsByDate as any[]).map((row) => ({
      date: row.date,
      total: parseFloat(row.total) || 0,
      count: parseInt(row.count, 10) || 0,
    }));

    res.json({
      totalDonations: totalDonations.toFixed(8),
      donationCount,
      queueLength,
      viewers,
      chartData,
      currentItem: getCurrentItem(),
    });
  } catch (err) {
    console.error('[Admin] Stats error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Donations History ─────────────────────────────────────

router.get('/donations', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(String(req.query.page) || '1', 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await Donation.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.json({
      donations: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Queue Management ──────────────────────────────────────

router.get('/queue', verifyToken, async (_req: Request, res: Response) => {
  res.json({
    queue: getQueue(),
    current: getCurrentItem(),
  });
});

router.post('/skip', verifyToken, async (_req: Request, res: Response) => {
  await skipCurrent();
  res.json({ message: 'Track skipped' });
});

router.post('/queue-manual', verifyToken, async (req: Request, res: Response) => {
  const { youtubeUrl } = req.body;
  if (!youtubeUrl) {
    res.status(400).json({ message: 'youtubeUrl is required' });
    return;
  }

  try {
    const item = await enqueue(youtubeUrl, 'admin-manual', 0, 'admin');
    if (item) {
      res.json({ message: 'Queued', item });
    } else {
      res.status(400).json({ message: 'Could not queue — check the URL or download failed' });
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Queue failed' });
  }
});

router.delete('/queue/:id', verifyToken, async (req: Request, res: Response) => {
  const removed = removeFromQueue(String(req.params.id));
  if (removed) {
    res.json({ message: 'Removed from queue' });
  } else {
    res.status(404).json({ message: 'Item not found in queue' });
  }
});

// ── Config ────────────────────────────────────────────────

router.get('/config', verifyToken, async (_req: Request, res: Response) => {
  try {
    const queuePrice = await getQueuePrice();
    const skipPrice = await getSkipPrice();
    const donationsEnabled = (await getRuntimeConfig('donationsEnabled', 'false')) === 'true';

    res.json({
      queueVideoPrice: queuePrice,
      skipVideoPrice: skipPrice,
      donationsEnabled,
    });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/config', verifyToken, async (req: Request, res: Response) => {
  try {
    const { queueVideoPrice, skipVideoPrice, donationsEnabled } = req.body;

    if (queueVideoPrice !== undefined) {
      await setRuntimeConfig('queueVideoPrice', String(queueVideoPrice));
    }
    if (skipVideoPrice !== undefined) {
      await setRuntimeConfig('skipVideoPrice', String(skipVideoPrice));
    }
    if (donationsEnabled !== undefined) {
      await setRuntimeConfig('donationsEnabled', String(donationsEnabled));
    }

    res.json({ message: 'Config updated' });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Live Mode ─────────────────────────────────────────────

router.post('/live/start', verifyToken, async (_req: Request, res: Response) => {
  const state = goLive();
  res.json({ message: 'Live mode activated', state });
});

router.post('/live/stop', verifyToken, async (_req: Request, res: Response) => {
  const state = goOffline();
  res.json({ message: 'Live mode deactivated', state });
});

router.get('/live/status', verifyToken, async (_req: Request, res: Response) => {
  try {
    const state = getLiveState();
    const mediamtxAlive = await isMediaMTXAlive();
    const streamActive = mediamtxAlive ? await checkMediaMTXStream() : false;

    res.json({
      ...state,
      mediamtxAlive,
      streamActive,
    });
  } catch {
    res.status(500).json({ message: 'Failed to check live status' });
  }
});

// ── Jingle Management ─────────────────────────────────────

const JINGLES_DIR = path.resolve(config.mediaDir, 'jingles');

// Ensure jingles dir exists
if (!fs.existsSync(JINGLES_DIR)) {
  fs.mkdirSync(JINGLES_DIR, { recursive: true });
}

const jingleUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, JINGLES_DIR),
    filename: (_req, file, cb) => {
      // Sanitize filename, keep original name
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const unique = `${Date.now()}-${safe}`;
      cb(null, unique);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp3', '.ogg', '.opus', '.wav', '.m4a', '.flac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${ext}. Allowed: ${allowed.join(', ')}`));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
});

router.get('/jingles', verifyToken, (_req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(JINGLES_DIR)
      .filter((f) => !f.startsWith('.'))
      .map((f) => {
        const filePath = path.join(JINGLES_DIR, f);
        const stat = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          size: stat.size,
          addedAt: stat.birthtime.toISOString(),
        };
      })
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));

    res.json({ jingles: files });
  } catch {
    res.status(500).json({ message: 'Failed to list jingles' });
  }
});

router.post('/jingles/upload', verifyToken, jingleUpload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ message: 'No file uploaded' });
    return;
  }

  console.log(`[Admin] Jingle uploaded: ${req.file.filename} (${req.file.size} bytes)`);
  res.json({
    message: 'Jingle uploaded',
    jingle: {
      name: req.file.filename,
      path: req.file.path,
      size: req.file.size,
    },
  });
});

router.delete('/jingles/:name', verifyToken, (req: Request, res: Response) => {
  const name = String(req.params.name);
  const filePath = path.join(JINGLES_DIR, name);

  // Prevent path traversal
  if (!filePath.startsWith(JINGLES_DIR)) {
    res.status(400).json({ message: 'Invalid filename' });
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: 'Jingle not found' });
    return;
  }

  fs.unlinkSync(filePath);
  console.log(`[Admin] Jingle deleted: ${name}`);
  res.json({ message: 'Jingle deleted' });
});

export default router;
