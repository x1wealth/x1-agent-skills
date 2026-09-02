// Portable export derived from X1 source revision 8e57a68dba1526633fb820684e9bc58e192dccca.
export function normalizeCapturedX1Call(call) {
  const result = call?.structured_result;
  if (
    result?.contract === "x1_capital_call_source_state_v1" &&
    result?.source &&
    typeof result.source.documentId === "string"
  ) {
    return {
      ...call,
      citations: [
        result.source.citation,
        ...(result.anchors ?? []).map((anchor) => anchor?.citation),
      ].filter((value) => typeof value === "string" && value.length > 0),
      source_ids: [result.source.documentId],
    };
  }
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
