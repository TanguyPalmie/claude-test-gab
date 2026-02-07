import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import rateLimit from 'express-rate-limit';

export function createUploadRouter(uploadsDir) {
  const router = Router();

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const uploadLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    message: { error: 'Too many uploads. Please wait.' },
  });

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_SIZE = 2 * 1024 * 1024; // 2MB

  const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const name = crypto.randomBytes(16).toString('hex');
      cb(null, `${name}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_SIZE },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_TYPES.includes(file.mimetype)) {
        cb(new Error('Only JPG, PNG, and WebP images are allowed'));
        return;
      }
      cb(null, true);
    },
  });

  // POST /api/uploads/avatar
  router.post('/avatar', uploadLimiter, (req, res) => {
    upload.single('avatar')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large (max 2MB)' });
        }
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }
      const url = `/uploads/${req.file.filename}`;
      res.json({ url });
    });
  });

  return router;
}
