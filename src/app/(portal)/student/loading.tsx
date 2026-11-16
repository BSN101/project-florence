import { ContentLoading } from "@/components/layout/portal-loading";

// Inside the workspace layout: only the content area shows a placeholder; the chrome stays mounted.
export default function Loading() {
  return <ContentLoading />;
}
