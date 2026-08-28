// Portable export derived from X1 source revision e91e1658669cc73e0c13ce6444892105edd31955.
export function normalizeCapturedX1Call(call) {
  const result = call?.structured_result;
  const closedResult = result?.closed_result;
  if (
    result?.projection !== "capital_call_closed_result_v1" ||
    !(closedResult && typeof closedResult === "object")
  ) {
    return call;
  }

  const sourceIds = [
    closedResult.document_id,
    closedResult.obligation_id,
    closedResult.thread_id,
    closedResult.closeout_id,
  ].filter((value) => typeof value === "string" && value.length > 0);
  const citations =
    typeof result.citation === "string" && result.citation.length > 0
      ? [result.citation]
      : [];
  return {
    ...call,
    citations,
    source_ids: [...new Set(sourceIds)],
  };
}
