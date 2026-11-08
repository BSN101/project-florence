import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function WorkspaceHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <p className="truncate font-heading font-semibold">{title}</p>
    </header>
  );
}
