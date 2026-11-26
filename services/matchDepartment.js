// Department key used to keep eval-informed examples within one department.
// Written onto embeddings by EmbeddingMetadataService and compared by both
// vector services, so the two sides must normalize identically.
//
// Exact abbrKey match (case-insensitive) — deliberately NOT resolved through
// scenario aliases, which would let e.g. ACOA and CED-QR examples cross over
// because both load the ISED scenario.
export function normalizeMatchDepartment(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
}
