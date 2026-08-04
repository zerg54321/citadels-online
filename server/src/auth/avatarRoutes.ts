import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer, { FileFilterCallback } from 'multer';
import sharp from 'sharp';
import { AuthedRequest, requireAuth } from './routes';
import { signAuthToken } from './jwt';
import { isPresetAvatar, PRESET_AVATARS, updateAvatar } from '../db/users';

// Avatar upload + preset-selection routes. Uploaded files are processed with
// sharp (strip EXIF, crop to square, resize 256×256, convert WebP) and stored
// in the avatar upload dir. Defaults to the project-root data/avatars/ dir —
// the same persistent area as the SQLite DB (database.ts resolves to
// ../../../data from dist/db, so we match with ../../../data/avatars from
// dist/auth). Production deployments override AVATAR_DIR to a path outside the
// git repo (see scripts/deploy-aliyun.sh) so uploads survive updates and are
// covered by the deploy backup.
const UPLOAD_DIR = process.env.AVATAR_DIR
  ? path.resolve(process.env.AVATAR_DIR)
  : path.resolve(__dirname, '../../../data/avatars');
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB pre-processing cap
const AVATAR_SIZE = 256;

// Validate the uploaded file by its actual bytes, not just the declared
// Content-Type / extension — sharp will reject non-images, but we also cap
// size early so a huge file isn't fully buffered. memoryStorage keeps the
// file in RAM only for the brief sharp pipeline; it never touches disk raw.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb: FileFilterCallback) => {
    // Accept common image MIME types; sharp re-validates the real bytes.
    if (/^image\/(png|jpeg|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('only PNG, JPEG, WebP, or GIF images are allowed'));
  },
});

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function createAvatarRouter(): Router {
  const router = Router();
  ensureUploadDir();

  // List available preset avatar ids (matches files in public/avatars/).
  // The client uses this to render the picker grid.
  router.get('/presets', (_req, res: Response) => {
    res.json({ status: 'ok', presets: PRESET_AVATARS });
  });

  // Serve an uploaded avatar by userId. Returns 404 if the user has no
  // upload on disk (client falls back to preset/default). Immutable-ish:
  // uploads overwrite the same {userId}.webp, so a short max-age lets the
  // browser cache but refresh after a re-upload.
  router.get('/:userId', (req: AuthedRequest, res: Response) => {
    const { userId } = req.params;
    // Reject path traversal: userId must be a hex string (genUserId output).
    if (!/^[a-f0-9]+$/.test(userId)) {
      res.status(400).json({ status: 'error', message: 'invalid user id' });
      return;
    }
    const file = path.join(UPLOAD_DIR, `${userId}.webp`);
    if (!fs.existsSync(file)) {
      res.status(404).json({ status: 'error', message: 'no avatar' });
      return;
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=60');
    fs.createReadStream(file).pipe(res);
  });

  // Select a preset avatar. Body: { ref: '01' }.
  router.post('/preset', requireAuth, (req: AuthedRequest, res: Response) => {
    const { ref } = req.body || {};
    if (typeof ref !== 'string' || !isPresetAvatar(ref)) {
      res.status(400).json({ status: 'error', message: 'invalid preset avatar' });
      return;
    }
    const result = updateAvatar(req.userId!, 'preset', ref);
    if (result.error || !result.user) {
      res.status(400).json({ status: 'error', message: result.error || 'update failed' });
      return;
    }
    const token = signAuthToken(result.user);
    res.json({ status: 'ok', token, user: result.user });
  });

  // Upload a custom avatar. multipart/form-data field name 'avatar'.
  // sharp: strip EXIF (privacy + orientation), contain-crop to square (center
  // crop would cut faces; we resize with 'cover' which crops the longer edge
  // — acceptable for square source images most users upload), 256×256 WebP.
  router.post('/upload', requireAuth, upload.single('avatar'), async (req: AuthedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ status: 'error', message: 'no file uploaded (field name must be "avatar")' });
      return;
    }
    try {
      const userId = req.userId!;
      const outPath = path.join(UPLOAD_DIR, `${userId}.webp`);
      await sharp(req.file.buffer)
        .rotate() // apply EXIF orientation then strip it
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: 85 })
        .toFile(outPath);

      const result = updateAvatar(userId, 'upload', userId);
      if (result.error || !result.user) {
        res.status(400).json({ status: 'error', message: result.error || 'update failed' });
        return;
      }
      const token = signAuthToken(result.user);
      res.json({ status: 'ok', token, user: result.user });
    } catch (err) {
      // sharp throws on non-image input despite the MIME filter
      const msg = err instanceof Error ? err.message : 'image processing failed';
      res.status(400).json({ status: 'error', message: msg });
    }
  });

  return router;
}
