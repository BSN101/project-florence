"use client";

import { PortalError } from "@/components/layout/portal-error";

// Inside the workspace layout, so the sidebar, header and phone tab bar stay mounted when a page fails.
export default function ErrorPage(props: React.ComponentProps<typeof PortalError>) {
  return <PortalError {...props} />;
}
