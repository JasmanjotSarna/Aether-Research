import { parsePdfRequest } from "@/lib/agent/request";
import { pdfFilename, renderReportPdfWithMeta } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 1_500_000;

export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parsePdfRequest(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.message }, { status: parsed.status });
  }

  try {
    const rendered = await renderReportPdfWithMeta(parsed.data);
    const filename = pdfFilename(parsed.data.title);

    return new Response(rendered.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(rendered.bytes.byteLength),
        "Cache-Control": "no-store",
        "X-Pdf-Pages": String(rendered.pages),
        "X-Pdf-Content-Pages": String(rendered.contentPages),
        "X-Pdf-On-Target": rendered.onTarget ? "true" : "false",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          "The PDF could not be generated. Check the report markdown and try again.",
        ...(process.env.NODE_ENV === "development" && error instanceof Error
          ? { detail: error.message }
          : {}),
      },
      { status: 500 }
    );
  }
}
