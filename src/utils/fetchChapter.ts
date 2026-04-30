import { getChapterContent } from "@/utils/contentCatalog";

export async function fetchChapter(vol: string, arc: string, chapter: string) {
  return getChapterContent(vol, arc, chapter);
}
