import { Router, type NextFunction } from "express";
import multer, { memoryStorage } from "multer";
import { utapi } from "../lib/uploadthing";
import { requireAuth } from "../lib/tenant";

const router = Router();

const imageUpload = multer({
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Apenas imagens são permitidas"));
    }
    cb(null, true);
  },
});

const documentUpload = multer({
  storage: memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    const ok = allowed.some((t) =>
      t.endsWith("/") ? file.mimetype.startsWith(t) : file.mimetype === t
    );
    if (!ok) return cb(new Error("Tipo de arquivo não permitido"));
    cb(null, true);
  },
});

router.post("/image", imageUpload.single("file"), async (req, res, next: NextFunction) => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    const maxSizeMB = req.body?.maxSizeMB ? parseFloat(req.body.maxSizeMB as string) : null;
    if (maxSizeMB && !isNaN(maxSizeMB) && req.file.size > maxSizeMB * 1024 * 1024) {
      res.status(413).json({
        error: `Arquivo muito grande. Máximo permitido: ${maxSizeMB} MB (recebido: ${(req.file.size / 1024 / 1024).toFixed(1)} MB)`,
      });
      return;
    }

    req.log?.info(
      { size: req.file.size, mime: req.file.mimetype, name: req.file.originalname },
      "[upload] received image, uploading to UploadThing"
    );

    // Use Buffer.from() to ensure the ArrayBuffer is fully isolated (byteOffset=0)
    // before passing to File — avoids potential shared-pool issues with multer buffers.
    const buf = Buffer.from(req.file.buffer);
    const file = new File([buf], req.file.originalname, { type: req.file.mimetype });

    const result = await utapi.uploadFiles(file);

    if (result.error) {
      req.log?.error({ err: result.error }, "[upload] utapi.uploadFiles failed");
      res.status(500).json({ error: result.error.message });
      return;
    }

    res.json({ url: result.data.ufsUrl, key: result.data.key, name: result.data.name });
  } catch (err) {
    next(err);
  }
});

router.post("/images", imageUpload.array("files", 10), async (req, res, next: NextFunction) => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    const maxSizeMB = req.body?.maxSizeMB ? parseFloat(req.body.maxSizeMB as string) : null;
    if (maxSizeMB && !isNaN(maxSizeMB)) {
      const oversized = files.find((f) => f.size > maxSizeMB * 1024 * 1024);
      if (oversized) {
        res.status(413).json({
          error: `Arquivo "${oversized.originalname}" muito grande. Máximo: ${maxSizeMB} MB`,
        });
        return;
      }
    }

    const uploadFiles = files.map(
      (f) => new File([Buffer.from(f.buffer)], f.originalname, { type: f.mimetype })
    );

    const results = await utapi.uploadFiles(uploadFiles);

    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      res.status(500).json({ error: errors[0].error?.message ?? "Upload falhou" });
      return;
    }

    res.json(results.map((r) => ({ url: r.data!.ufsUrl, key: r.data!.key, name: r.data!.name })));
  } catch (err) {
    next(err);
  }
});

router.post("/document", documentUpload.single("file"), async (req, res, next: NextFunction) => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    const buf = Buffer.from(req.file.buffer);
    const file = new File([buf], req.file.originalname, { type: req.file.mimetype });

    const result = await utapi.uploadFiles(file);

    if (result.error) {
      req.log?.error({ err: result.error }, "[upload] utapi.uploadFiles failed (document)");
      res.status(500).json({ error: result.error.message });
      return;
    }

    res.json({
      url: result.data.ufsUrl,
      key: result.data.key,
      name: result.data.name,
      size: result.data.size,
      mimeType: req.file.mimetype,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
