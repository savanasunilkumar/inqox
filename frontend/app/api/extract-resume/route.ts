import { extractText, getDocumentProxy } from "unpdf";
import { extractFromResumeText } from "@/lib/resume-extractor";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let bytes: Uint8Array;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return Response.json({ error: "No file provided" }, { status: 400 });
      }
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      bytes = new Uint8Array(await request.arrayBuffer());
    }

    if (bytes.length === 0) {
      return Response.json({ error: "Empty file provided" }, { status: 400 });
    }

    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (header !== "%PDF-") {
      return Response.json({ error: "Invalid PDF format" }, { status: 400 });
    }

    let text = "";
    try {
      const pdf = await getDocumentProxy(bytes);
      try {
        const result = await extractText(pdf, { mergePages: true });
        text = result.text.slice(0, 80000);
      } finally {
        await pdf.loadingTask.destroy();
      }
    } catch (pdfErr) {
      console.error("[RÉSUMÉ EXTRACTION ERROR]:", pdfErr);
      return Response.json({ error: "Could not read text from this PDF. Please ensure it is not scanned or password-protected." }, { status: 400 });
    }

    if (!text || text.trim().length < 10) {
      return Response.json({
        error: "This PDF appears to be scanned or contains no selectable text.",
        rawText: text,
      }, { status: 400 });
    }

    const extraction = extractFromResumeText(text);

    // ================= DETAILED LOGGING =================
    console.log("\n=================== RÉSUMÉ EXTRACTION LOGS ===================");
    console.log(`[Document Size]: ${bytes.length} bytes | Text Length: ${text.length} characters`);
    console.log(`[Education Detected]: ${extraction.hasEducation ? "YES" : "NO"} (${extraction.education.length} credentials)`);
    extraction.education.forEach((edu, idx) => {
      console.log(`  [Institution ${idx + 1}]: "${edu.school}" | Degree: "${edu.degree}" | Major: "${edu.major}" | Grad: "${edu.graduationDate}"`);
    });
    console.log(`[Experience Detected]: ${extraction.hasExperience ? "YES" : "NO"} (${extraction.experience.length} roles)`);
    extraction.experience.forEach((exp, idx) => {
      console.log(`  [Company ${idx + 1}]: "${exp.company}" | Role: "${exp.title}" | Dates: "${exp.dateRange}"`);
    });
    console.log("----------------- Granular Parser Logs -----------------");
    extraction.logs.forEach(l => {
      console.log(`  • [${l.category.toUpperCase()}] ${l.message}`);
    });
    console.log("==============================================================\n");

    return Response.json({
      success: true,
      rawTextLength: text.length,
      extraction,
      text,
    });
  } catch (err) {
    console.error("[EXTRACTION ROUTE ERROR]:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Failed to extract résumé data" }, { status: 500 });
  }
}
