import fs from "fs";
import path from "path";
import multer from "multer";
import { AppError } from "../utils/AppError.js";

export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
export const UPLOAD_MENU_DIR = path.join(UPLOAD_ROOT, "menu");

fs.mkdirSync(UPLOAD_MENU_DIR, { recursive: true });

const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_MENU_DIR),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype) || !ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    return cb(new AppError("Only image uploads are allowed", 400));
  }

  cb(null, true);
};

export const removeUploadedFile = (file) => {
  if (!file?.path) return;
  if (fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }
};

export const assertValidUploadedImage = (file) => {
  if (!file) return;

  const buffer = fs.readFileSync(file.path);
  const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    removeUploadedFile(file);
    throw new AppError("Uploaded file is not a valid image", 400);
  }
};

export const uploadMenuImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});
