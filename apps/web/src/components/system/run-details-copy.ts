import type { runStatus } from "./run-format";

/** Bilingual labels for the expanded run details panel. */
export const COPY = {
  en: {
    summary: "Run summary",
    started: "Started",
    ended: "Ended",
    duration: "Duration",
    status: "Status",
    source: "Sources",
    tokens: "Token usage",
    total: "Total",
    input: "Input",
    output: "Output",
    cached: "Cached",
    models: "Models used",
    workflow: "Workflow steps",
    attempts: "LLM attempts",
    noAttempts: "No per-attempt data available.",
    noModels: "No model data available.",
    preIdentityModels:
      "No per-run model data. Runs logged before per-attempt run identity only report token totals.",
    modelsUnavailable:
      "Model attribution unavailable — per-call model data could not be read for this run.",
    modelsLoading: "Loading models used…",
    noWorkflow: "No workflow step detail available.",
    errors: "Errors / fallback",
    fallback: "Fallback chain",
    fromSteps: "Reported by workflow steps",
    noErrors: "No error recorded.",
    ok: "OK",
    error: "Error",
    empty: "Empty",
    unknown: "Unknown",
    inProgress: "In progress",
    attemptsLoading: "Loading attempt details…",
    attemptsUnavailable: "Attempt details are unavailable.",
    attemptsError: "Could not load attempt details.",
    attemptsEmpty: "No LLM calls recorded for this run.",
    attemptsPreIdentity:
      "This run reports token totals but no per-attempt rows. Runs logged before per-attempt run identity shipped have no attempt data.",
    attemptsTruncated: "Showing the first 2,000 calls for this run.",
  },
  vi: {
    summary: "Tóm tắt lần chạy",
    started: "Bắt đầu",
    ended: "Kết thúc",
    duration: "Thời lượng",
    status: "Trạng thái",
    source: "Nguồn",
    tokens: "Mức dùng token",
    total: "Tổng",
    input: "Đầu vào",
    output: "Đầu ra",
    cached: "Đệm",
    models: "Mô hình",
    workflow: "Các bước",
    attempts: "Các lần gọi LLM",
    noAttempts: "Chưa có dữ liệu từng lần gọi.",
    noModels: "Chưa có dữ liệu mô hình.",
    preIdentityModels:
      "Chưa có dữ liệu mô hình theo lần chạy. Các lần chạy ghi nhận trước khi có định danh lần gọi chỉ báo tổng token.",
    modelsUnavailable:
      "Không xác định được mô hình — không đọc được dữ liệu mô hình theo từng lần gọi của lần chạy này.",
    modelsLoading: "Đang tải mô hình đã dùng…",
    noWorkflow: "Chưa có dữ liệu bước xử lý.",
    errors: "Lỗi / fallback",
    fallback: "Chuỗi fallback",
    fromSteps: "Được báo bởi các bước xử lý",
    noErrors: "Không ghi nhận lỗi.",
    ok: "OK",
    error: "Lỗi",
    empty: "Trống",
    unknown: "Không rõ",
    inProgress: "Đang chạy",
    attemptsLoading: "Đang tải chi tiết lần gọi…",
    attemptsUnavailable: "Không có chi tiết lần gọi.",
    attemptsError: "Không thể tải chi tiết lần gọi.",
    attemptsEmpty: "Không ghi nhận lần gọi LLM cho lần chạy này.",
    attemptsPreIdentity:
      "Lần chạy này có tổng token nhưng không có dữ liệu từng lần gọi. Các lần chạy ghi nhận trước khi có định danh lần gọi không lưu chi tiết.",
    attemptsTruncated: "Chỉ hiển thị 2.000 lần gọi đầu tiên của lần chạy này.",
  },
} as const;

export function statusLabel(
  status: ReturnType<typeof runStatus>,
  lang: "en" | "vi"
): string {
  const copy = COPY[lang];
  if (status === "ok") return copy.ok;
  if (status === "error") return copy.error;
  if (status === "empty") return copy.empty;
  if (status === "in_progress") return copy.inProgress;
  return copy.unknown;
}
