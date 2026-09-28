import { apiJson } from "@/lib/api";

export function GET() {
  return apiJson({ status: "ok" });
}
