import { buildTemplate } from "@/lib/tayau-excel";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  await requireAuth();
  return new Response(new Uint8Array(buildTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-encuesta-tayau.xlsx"',
    },
  });
}
