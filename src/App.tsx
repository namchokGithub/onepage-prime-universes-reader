import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { EditorPage } from "@/pages/EditorPage";
import { ReaderPage } from "@/pages/ReaderPage";
import { getFirstEditorPath, getFirstReaderPath } from "@/utils/contentCatalog";

const CAN_USE_LOCAL_EDITOR = import.meta.env.DEV;

export default function App() {
  const firstReaderPath = getFirstReaderPath();
  const firstEditorPath = getFirstEditorPath();

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to={firstReaderPath} replace />} />
        <Route path="/read/:vol/:arc/:chapter" element={<ReaderPage />} />
        <Route
          path="/editor"
          element={
            <Navigate
              to={CAN_USE_LOCAL_EDITOR ? firstEditorPath : firstReaderPath}
              replace
            />
          }
        />
        <Route
          path="/editor/:vol/:arc/:chapter"
          element={
            CAN_USE_LOCAL_EDITOR ? (
              <EditorPage />
            ) : (
              <Navigate to={firstReaderPath} replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={firstReaderPath} replace />} />
      </Route>
    </Routes>
  );
}
