import type { DocumentCategory } from "@/lib/types/database";

/**
 * Shared between the upload form, the documents table filter, and the
 * category-targeted retrieval Phase 2's Opportunity Mapping does against
 * tools/stack/constraints/engineering-docs specifically (CLAUDE.md, "Data
 * model additions"). "general" is the original, undifferentiated knowledge
 * base the main chat retrieval already draws from.
 */
export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "tools", label: "Tools" },
  { value: "stack", label: "Stack" },
  { value: "constraints", label: "Engineering constraints" },
  { value: "engineering-docs", label: "Engineering docs" },
];

export function categoryLabel(category: DocumentCategory): string {
  return DOCUMENT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
