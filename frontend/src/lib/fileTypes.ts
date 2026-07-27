/**
 * One source of truth for the file types the on-device document parser can turn
 * into text — PDF, Word, image (OCR), and plain text. Shared across the CV import,
 * LinkedIn import, and Writing-Voice upload flows so they stay in sync.
 */

export const DOC_ACCEPT = ".pdf,.doc,.docx";
export const TEXT_ACCEPT = ".txt,.md,.markdown,.text,.rst,.log,.csv,.json";
export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.gif,.heic";

/** Broadest file-picker `accept`: everything the parser reads, by extension and MIME. */
export const FILE_ACCEPT =
  `${DOC_ACCEPT},${TEXT_ACCEPT},${IMAGE_ACCEPT},` +
  "application/pdf,image/*,text/*," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

const asExts = (csv: string) => csv.split(",").map((s) => s.trim()).filter(Boolean);
const TEXT_EXTS = asExts(TEXT_ACCEPT);
const IMAGE_EXTS = asExts(IMAGE_ACCEPT);
const ALL_EXTS = [...asExts(DOC_ACCEPT), ...TEXT_EXTS, ...IMAGE_EXTS];

/** Plain-text file we can read in the browser without a server round-trip. */
export function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith("text/") || TEXT_EXTS.some((ext) => name.endsWith(ext));
}

/** Image file — needs OCR to read. */
export function isImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith("image/") || IMAGE_EXTS.some((ext) => name.endsWith(ext));
}

/** Any file the on-device parser can turn into text (PDF, Word, image, or text). */
export function isParseableDocument(file: File): boolean {
  const name = file.name.toLowerCase();
  const ct = file.type.toLowerCase();
  return (
    ALL_EXTS.some((ext) => name.endsWith(ext)) ||
    ct === "application/pdf" ||
    ct.startsWith("image/") ||
    ct.startsWith("text/") ||
    ct.includes("wordprocessingml") ||
    ct.includes("msword")
  );
}
