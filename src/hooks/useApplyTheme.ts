import { useEffect } from "react";
import { useReaderStore } from "@/store/useReaderStore";

export function useApplyTheme() {
  const theme = useReaderStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
}
