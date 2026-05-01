import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { EditorPage } from "@/pages/EditorPage";
import { ReaderPage } from "@/pages/ReaderPage";
import {
  Catalog,
  getCatalog,
  getFirstEditorPath,
  getFirstReaderPath,
} from "@/utils/contentRepository";
import { useCallback, useEffect, useState } from "react";

const EMPTY_CATALOG: Catalog = { volumes: [] };

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const firstReaderPath = getFirstReaderPath(catalog);
  const firstEditorPath = getFirstEditorPath(catalog);

  const refreshCatalog = useCallback(async () => {
    setCatalogError(null);
    const nextCatalog = await getCatalog();
    setCatalog(nextCatalog);
    return nextCatalog;
  }, []);

  useEffect(() => {
    let active = true;

    setIsCatalogLoading(true);
    refreshCatalog()
      .catch((error: Error) => {
        if (active) setCatalogError(error.message);
      })
      .finally(() => {
        if (active) setIsCatalogLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshCatalog]);

  if (isCatalogLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Loading library...
      </div>
    );
  }

  return (
    <Routes>
      <Route
        element={
          <AppLayout
            catalog={catalog}
            catalogError={catalogError}
            refreshCatalog={refreshCatalog}
          />
        }>
        <Route index element={<Navigate to={firstReaderPath} replace />} />
        <Route path="/read/:vol/:arc/:chapter" element={<ReaderPage />} />
        <Route
          path="/editor"
          element={
            firstEditorPath === "/editor" ? (
              <EditorPage />
            ) : (
              <Navigate to={firstEditorPath} replace />
            )
          }
        />
        <Route
          path="/editor/:vol/:arc/:chapter"
          element={<EditorPage />}
        />
        <Route path="*" element={<Navigate to={firstReaderPath} replace />} />
      </Route>
    </Routes>
  );
}
