"use client";

import { PortalError } from "@/components/layout/portal-error";

export default function ErrorPage(props: React.ComponentProps<typeof PortalError>) {
  return <PortalError {...props} />;
}
