import { Router } from "express";
import multer from "multer";
import { utapi } from "../lib/uploadthing";
import { requireAuth } from "../lib/tenant";
import { logger } from "../lib/logger";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024,
    files: 10,
  },
});

// POST /api/upload/image — single image, max 8 MB
router.post("/image", upload.single("file"), async (req, res, next) => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }
    if (req.file.size > 8 * 1024 * 1024) {
      res.status(400).json({ error: "Imagem deve ter no máximo 8 MB" });
      return;
    }

    // Buffer<ArrayBufferLike> is not narrowed to an accepted File bit type in strict TS,
    // but at runtime multer's memoryStorage always returns a regular ArrayBuffer-backed Buffer.
    const file = new File([req.file.buffer as unknown as ArrayBuffer], req.file.originalname, {
      type: req.file.mimetype,
    });
    const result = await utapi.uploadFiles(file);
    if (result.error || !result.data) {
      logger.error({ err: result.error }, "[upload] UTApi uploadFiles error");
      res.status(500).json({ error: "Falha ao enviar para o armazenamento" });
      return;
    }
    res.json({ url: result.data.ufsUrl, key: result.data.key });
  } catch (err) {
    next(err);
  }
});

// POST /api/upload/images — multiple images, max 8 MB each, max 10 files
router.post("/images", upload.array("file", 10), async (req, res, next) => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    const toUpload = files.map(
      (f) => new File([f.buffer as unknown as ArrayBuffer], f.originalname, { type: f.mimetype })
    );
    const results = await utapi.uploadFiles(toUpload);
    const urls: string[] = [];
    for (const r of Array.isArray(results) ? results : [results]) {
      if (r.error || !r.data) {
        logger.error({ err: r.error }, "[upload] UTApi uploadFiles error (multi)");
        res.status(500).json({ error: "Falha ao enviar para o armazenamento" });
        return;
      }
      urls.push(r.data.ufsUrl);
    }
    res.json({ urls });
  } catch (err) {
    next(err);
  }
});

// POST /api/upload/document — single document (image/pdf/word/excel), max 16 MB
router.post("/document", upload.single("file"), async (req, res, next) => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    const file = new File([req.file.buffer as unknown as ArrayBuffer], req.file.originalname, {
      type: req.file.mimetype,
    });
    const result = await utapi.uploadFiles(file);
    if (result.error || !result.data) {
      logger.error({ err: result.error }, "[upload] UTApi uploadFiles error (document)");
      res.status(500).json({ error: "Falha ao enviar para o armazenamento" });
      return;
    }
    res.json({
      url: result.data.ufsUrl,
      key: result.data.key,
      name: result.data.name,
      size: result.data.size,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
