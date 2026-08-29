import { useParams } from "react-router";
import { WebsiteRenderer } from "./WebsiteRenderer";

export function WebsitePreview() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return null;
  return <WebsiteRenderer slug={slug} />;
}
