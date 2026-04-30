import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { EditorPage } from "@/pages/EditorPage";
import { ReaderPage } from "@/pages/ReaderPage";
import { getFirstEditorPath, getFirstReaderPath } from "@/utils/contentCatalog";

export default function App() {
  const firstReaderPath = getFirstReaderPath();
  const firstEditorPath = getFirstEditorPath();

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to={firstReaderPath} replace />} />
        <Route path="/read/:vol/:arc/:chapter" element={<ReaderPage />} />
        <Route path="/editor" element={<Navigate to={firstEditorPath} replace />} />
        <Route path="/editor/:vol/:arc/:chapter" element={<EditorPage />} />
        <Route path="*" element={<Navigate to={firstReaderPath} replace />} />
      </Route>
    </Routes>
  );
}
