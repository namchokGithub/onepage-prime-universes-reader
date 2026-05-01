import { getChapterContent } from "@/utils/contentRepository";

export async function fetchChapter(vol: string, arc: string, chapter: string) {
  return getChapterContent(vol, arc, chapter);
}
