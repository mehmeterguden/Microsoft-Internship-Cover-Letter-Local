import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

/**
 * Rasterize the letter sheet and save it as a multi-page A4 PDF. Fully local —
 * no network, no external service. Uses html2canvas-pro so Tailwind v4's oklch
 * colors are parsed correctly.
 */
export async function exportLetterPdf(elementId: string, filename = "cover-letter.pdf") {
  const el = document.getElementById(elementId);
  if (!el) throw new Error("Letter element not found");

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;
  const img = canvas.toDataURL("image/jpeg", 0.95);

  if (imgH <= pageH) {
    pdf.addImage(img, "JPEG", 0, 0, pageW, imgH);
  } else {
    // Taller than one page — slice across multiple A4 pages.
    let remaining = imgH;
    let offset = 0;
    while (remaining > 0) {
      pdf.addImage(img, "JPEG", 0, -offset, pageW, imgH);
      remaining -= pageH;
      offset += pageH;
      if (remaining > 0) pdf.addPage();
    }
  }

  pdf.save(filename);
}
