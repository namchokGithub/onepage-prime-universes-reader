import { useEffect } from "react";
import { useReaderStore } from "@/store/useReaderStore";

export function useApplyTheme() {
  const theme = useReaderStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "night");
  }, [theme]);
}
