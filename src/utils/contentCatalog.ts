type ChapterLoader = () => Promise<string>;

export type Chapter = {
  title: string;
  vol: string;
  arc: string;
  chapter: string;
};

export type Catalog = {
  volumes: Array<{
    id: string;
    title: string;
    arcs: Array<{
      id: string;
      title: string;
      chapters: Chapter[];
    }>;
  }>;
};

const chapterLoaders = import.meta.glob<string>("/src/content/**/*.md", {
  query: "?raw",
  import: "default",
});

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function toRomanNumeral(value: number) {
  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = value;
  let result = "";

  numerals.forEach(([number, numeral]) => {
    while (remaining >= number) {
      result += numeral;
      remaining -= number;
    }
  });

  return result;
}

function titleFromSegment(segment: string, fallbackPrefix: string) {
  const match = segment.match(/^(vol|volume|arc|ch|chapter)-(.+)$/i);
  const segmentType = match?.[1]?.toLowerCase();
  const titlePart = match?.[2] ?? segment;
  const normalizedTitle = titlePart.replace(/[-_]+/g, " ").trim();

  const numberedTitle = normalizedTitle.match(/^(\d+)\s+(.+)$/);

  if (
    numberedTitle &&
    segmentType &&
    ["vol", "volume", "arc"].includes(segmentType)
  ) {
    return `${toRomanNumeral(Number(numberedTitle[1]))}. ${numberedTitle[2]}`;
  }

  if (
    numberedTitle &&
    segmentType &&
    ["ch", "chapter"].includes(segmentType)
  ) {
    return `${fallbackPrefix} ${Number(numberedTitle[1])}: ${numberedTitle[2]}`;
  }

  if (/^\d+$/.test(normalizedTitle)) {
    return `${fallbackPrefix} ${Number(normalizedTitle)}`;
  }

  return normalizedTitle;
}

function sortById<T extends { id: string }>(items: T[]) {
  return [...items].sort((a, b) => collator.compare(a.id, b.id));
}

export function getCatalog(): Catalog {
  const volumes = new Map<
    string,
    {
      id: string;
      title: string;
      arcs: Map<string, { id: string; title: string; chapters: Chapter[] }>;
    }
  >();

  Object.keys(chapterLoaders).forEach((path) => {
    const match = path.match(/^\/src\/content\/([^/]+)\/([^/]+)\/([^/]+)\.md$/);
    if (!match) return;

    const [, vol, arc, chapter] = match;

    if (!volumes.has(vol)) {
      volumes.set(vol, {
        id: vol,
        title: titleFromSegment(vol, "Volume"),
        arcs: new Map(),
      });
    }

    const volume = volumes.get(vol);
    if (!volume) return;

    if (!volume.arcs.has(arc)) {
      volume.arcs.set(arc, {
        id: arc,
        title: titleFromSegment(arc, "Arc"),
        chapters: [],
      });
    }

    volume.arcs.get(arc)?.chapters.push({
      title: titleFromSegment(chapter, "Chapter"),
      vol,
      arc,
      chapter,
    });
  });

  return {
    volumes: sortById(
      Array.from(volumes.values()).map((volume) => ({
        id: volume.id,
        title: volume.title,
        arcs: sortById(Array.from(volume.arcs.values())).map((arc) => ({
          ...arc,
          chapters: sortById(
            arc.chapters.map((chapter) => ({ ...chapter, id: chapter.chapter })),
          ).map(({ id: _id, ...chapter }) => chapter),
        })),
      })),
    ),
  };
}

export function getFirstReaderPath() {
  const firstChapter = getCatalog().volumes[0]?.arcs[0]?.chapters[0];

  if (!firstChapter) return "/editor";
  return `/read/${firstChapter.vol}/${firstChapter.arc}/${firstChapter.chapter}`;
}

export function getFirstEditorPath() {
  const firstChapter = getCatalog().volumes[0]?.arcs[0]?.chapters[0];

  if (!firstChapter) return "/editor";
  return `/editor/${firstChapter.vol}/${firstChapter.arc}/${firstChapter.chapter}`;
}

export function getChapterTitle(vol: string, arc: string, chapter: string) {
  const catalogChapter = getCatalog()
    .volumes.find((volume) => volume.id === vol)
    ?.arcs.find((catalogArc) => catalogArc.id === arc)
    ?.chapters.find((catalogChapter) => catalogChapter.chapter === chapter);

  return catalogChapter?.title ?? titleFromSegment(chapter, "Chapter");
}

export async function getChapterContent(vol: string, arc: string, chapter: string) {
  const loader = chapterLoaders[`/src/content/${vol}/${arc}/${chapter}.md`] as
    | ChapterLoader
    | undefined;

  if (!loader) {
    throw new Error(`Unable to load chapter: /content/${vol}/${arc}/${chapter}.md`);
  }

  return loader();
}
