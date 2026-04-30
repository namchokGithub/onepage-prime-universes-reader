import { useState } from "react";
import { BookOpen, FilePenLine, Menu, Moon, Sun } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useApplyTheme } from "@/hooks/useApplyTheme";
import { useReaderStore } from "@/store/useReaderStore";
import { cn } from "@/lib/utils";
import { getCatalog, getFirstEditorPath, getFirstReaderPath } from "@/utils/contentCatalog";

export function AppLayout() {
  useApplyTheme();

  const theme = useReaderStore((state) => state.theme);
  const toggleTheme = useReaderStore((state) => state.toggleTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isReadRoute = location.pathname.startsWith("/read/");
  const isEditorRoute = location.pathname.startsWith("/editor");
  const catalog = getCatalog();
  const firstReaderPath = getFirstReaderPath();
  const firstEditorPath = getFirstEditorPath();

  const topNavClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "border border-transparent",
      isActive &&
        "border-primary/30 bg-accent text-accent-foreground shadow-sm",
    );

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div
          className={cn(
            "mx-auto flex h-16 w-full items-center justify-between px-4",
            isEditorRoute ? "max-w-[1600px]" : "max-w-6xl",
          )}>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen((value) => !value)}
              aria-label="Toggle navigation">
              <Menu className="h-5 w-5" />
            </Button>
            <NavLink
              to={firstReaderPath}
              className="text-lg font-semibold">
              One Page Reader
            </NavLink>
          </div>

          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <NavLink
                to={firstReaderPath}
                className={isReadRoute ? topNavClass : "disabled"}>
                <BookOpen className="h-4 w-4" />
                Reader
              </NavLink>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <NavLink
                to={firstEditorPath}
                className={!isReadRoute ? topNavClass : "disabled"}>
                <FilePenLine className="h-4 w-4" />
                Editor
              </NavLink>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme">
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </nav>
        </div>
      </header>

      <div
        className={cn(
          "mx-auto grid w-full grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]",
          isEditorRoute ? "max-w-[1600px]" : "max-w-6xl",
        )}>
        <aside
          className={cn(
            "border-b bg-background px-4 py-4 md:block md:min-h-[calc(100vh-4rem)] md:border-b-0 md:border-r",
            sidebarOpen ? "block" : "hidden",
          )}>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Library
              </p>
              <Separator className="mt-3" />
            </div>
            {catalog.volumes.length === 0 ? (
              <p className="rounded-md border p-3 text-sm text-muted-foreground">
                Add .md files under src/content/vol-1/arc-1.
              </p>
            ) : null}
            {catalog.volumes.map((volume) => (
              <div key={volume.id} className="space-y-3">
                <p className="font-medium">{volume.title}</p>
                {volume.arcs.map((arc) => (
                  <div key={arc.id} className="space-y-2 pl-2">
                    <p className="text-sm text-muted-foreground">{arc.title}</p>
                    <div className="space-y-1">
                      {arc.chapters.map((chapter) => (
                        <NavLink
                          key={`${chapter.vol}-${chapter.arc}-${chapter.chapter}`}
                          to={
                            isEditorRoute
                              ? `/editor/${chapter.vol}/${chapter.arc}/${chapter.chapter}`
                              : `/read/${chapter.vol}/${chapter.arc}/${chapter.chapter}`
                          }
                          onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) =>
                            cn(
                              "block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                              isActive && "bg-accent text-accent-foreground",
                            )
                          }>
                          {chapter.title}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <main className={cn("min-w-0 px-4 py-8", isEditorRoute ? "md:px-6" : "md:px-8")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
