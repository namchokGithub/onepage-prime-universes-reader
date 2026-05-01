import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

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

export type CreateEntryType = "volume" | "arc" | "chapter";

export type CreatedEntry = {
  vol: string;
  arc: string;
  chapter: string;
};

type ChapterDocument = {
  volId: string;
  volTitle: string;
  volOrder: number;
  arcId: string;
  arcTitle: string;
  arcOrder: number;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  content: string;
};

const CHAPTERS_COLLECTION = "chapters";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function documentId(vol: string, arc: string, chapter: string) {
  return [vol, arc, chapter].map(encodeURIComponent).join("__");
}

function parseOrder(segment: string, prefix: string) {
  const match = segment.match(new RegExp(`^${prefix}-(\\d+)(?:-|$)`, "i"));
  return Number(match?.[1] ?? 0);
}

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

function sanitizeTitle(title: string | undefined, fallback: string) {
  const sanitized = (title ?? "")
    .normalize("NFC")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");

  return sanitized || fallback;
}

function nextNumber(items: string[], prefix: string) {
  const matcher = new RegExp(`^${prefix}-(\\d+)(?:-|$)`, "i");
  const numbers = items
    .map((item) => Number(item.match(matcher)?.[1] ?? 0))
    .filter((number) => Number.isFinite(number));

  return Math.max(0, ...numbers) + 1;
}

function renameSegment(segment: string, prefix: string, title: string | undefined) {
  const order = parseOrder(segment, prefix);

  if (!order) {
    throw new Error(`Invalid ${prefix} segment`);
  }

  return `${prefix}-${order}-${sanitizeTitle(title, `new-${prefix}`)}`;
}

function sortByOrderThenId<T extends { id: string; order: number }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return collator.compare(a.id, b.id);
  });
}

function normalizeChapterDocument(data: Partial<ChapterDocument>) {
  const volId = data.volId ?? "";
  const arcId = data.arcId ?? "";
  const chapterId = data.chapterId ?? "";

  return {
    volId,
    volTitle: data.volTitle ?? titleFromSegment(volId, "Volume"),
    volOrder: Number(data.volOrder) || parseOrder(volId, "vol"),
    arcId,
    arcTitle: data.arcTitle ?? titleFromSegment(arcId, "Arc"),
    arcOrder: Number(data.arcOrder) || parseOrder(arcId, "arc"),
    chapterId,
    chapterTitle:
      data.chapterTitle ?? titleFromSegment(chapterId, "Chapter"),
    chapterOrder:
      Number(data.chapterOrder) || parseOrder(chapterId, "ch"),
    content: data.content ?? "",
  } satisfies ChapterDocument;
}

export async function getCatalog() {
  const snapshot = await getDocs(collection(getFirebaseDb(), CHAPTERS_COLLECTION));
  const volumes = new Map<
    string,
    {
      id: string;
      title: string;
      order: number;
      arcs: Map<
        string,
        {
          id: string;
          title: string;
          order: number;
          chapters: Array<Chapter & { id: string; order: number }>;
        }
      >;
    }
  >();

  snapshot.forEach((chapterSnapshot) => {
    const chapterData = normalizeChapterDocument(
      chapterSnapshot.data() as Partial<ChapterDocument>,
    );

    if (!chapterData.volId || !chapterData.arcId || !chapterData.chapterId) {
      return;
    }

    if (!volumes.has(chapterData.volId)) {
      volumes.set(chapterData.volId, {
        id: chapterData.volId,
        title: chapterData.volTitle,
        order: chapterData.volOrder,
        arcs: new Map(),
      });
    }

    const volume = volumes.get(chapterData.volId);
    if (!volume) return;

    if (!volume.arcs.has(chapterData.arcId)) {
      volume.arcs.set(chapterData.arcId, {
        id: chapterData.arcId,
        title: chapterData.arcTitle,
        order: chapterData.arcOrder,
        chapters: [],
      });
    }

    volume.arcs.get(chapterData.arcId)?.chapters.push({
      id: chapterData.chapterId,
      title: chapterData.chapterTitle,
      vol: chapterData.volId,
      arc: chapterData.arcId,
      chapter: chapterData.chapterId,
      order: chapterData.chapterOrder,
    });
  });

  return {
    volumes: sortByOrderThenId(Array.from(volumes.values())).map((volume) => ({
      id: volume.id,
      title: volume.title,
      arcs: sortByOrderThenId(Array.from(volume.arcs.values())).map((arc) => ({
        id: arc.id,
        title: arc.title,
        chapters: sortByOrderThenId(arc.chapters).map(
          ({ id: _id, order: _order, ...chapter }) => chapter,
        ),
      })),
    })),
  } satisfies Catalog;
}

export function getFirstReaderPath(catalog: Catalog) {
  const firstChapter = catalog.volumes[0]?.arcs[0]?.chapters[0];

  if (!firstChapter) return "/editor";
  return `/read/${firstChapter.vol}/${firstChapter.arc}/${firstChapter.chapter}`;
}

export function getFirstEditorPath(catalog: Catalog) {
  const firstChapter = catalog.volumes[0]?.arcs[0]?.chapters[0];

  if (!firstChapter) return "/editor";
  return `/editor/${firstChapter.vol}/${firstChapter.arc}/${firstChapter.chapter}`;
}

export function getChapterTitle(
  catalog: Catalog,
  vol: string,
  arc: string,
  chapter: string,
) {
  const catalogChapter = catalog.volumes
    .find((volume) => volume.id === vol)
    ?.arcs.find((catalogArc) => catalogArc.id === arc)
    ?.chapters.find((catalogChapter) => catalogChapter.chapter === chapter);

  return catalogChapter?.title ?? titleFromSegment(chapter, "Chapter");
}

export function getChapterHeader(
  catalog: Catalog,
  vol: string,
  arc: string,
  chapter: string,
) {
  const catalogVolume = catalog.volumes.find((volume) => volume.id === vol);
  const catalogArc = catalogVolume?.arcs.find(
    (catalogArc) => catalogArc.id === arc,
  );
  const catalogChapter = catalogArc?.chapters.find(
    (catalogChapter) => catalogChapter.chapter === chapter,
  );

  return {
    volumeTitle: catalogVolume?.title ?? vol.replace(/[-_]+/g, " "),
    arcTitle: catalogArc?.title ?? arc.replace(/[-_]+/g, " "),
    chapterTitle: catalogChapter?.title ?? chapter.replace(/[-_]+/g, " "),
  };
}

export async function getChapterContent(
  vol: string,
  arc: string,
  chapter: string,
) {
  const chapterReference = doc(
    getFirebaseDb(),
    CHAPTERS_COLLECTION,
    documentId(vol, arc, chapter),
  );
  const snapshot = await getDoc(chapterReference);

  if (!snapshot.exists()) {
    throw new Error(`Unable to load chapter: ${vol}/${arc}/${chapter}`);
  }

  return normalizeChapterDocument(
    snapshot.data() as Partial<ChapterDocument>,
  ).content;
}

export async function saveChapterContent(
  vol: string,
  arc: string,
  chapter: string,
  content: string,
) {
  await updateDoc(doc(getFirebaseDb(), CHAPTERS_COLLECTION, documentId(vol, arc, chapter)), {
    content,
    updatedAt: serverTimestamp(),
  });
}

export async function createEntry(
  catalog: Catalog,
  type: CreateEntryType,
  context: { vol?: string; arc?: string },
  title?: string,
) {
  let created: CreatedEntry;
  let volTitle = "";
  let volOrder = 0;
  let arcTitle = "";
  let arcOrder = 0;

  if (type === "volume") {
    const volumeNumber = nextNumber(
      catalog.volumes.map((volume) => volume.id),
      "vol",
    );
    created = {
      vol: `vol-${volumeNumber}-${sanitizeTitle(title, "new-volume")}`,
      arc: "arc-1-new-arc",
      chapter: "ch-1",
    };
    volTitle = titleFromSegment(created.vol, "Volume");
    volOrder = volumeNumber;
    arcTitle = titleFromSegment(created.arc, "Arc");
    arcOrder = 1;
  } else if (type === "arc") {
    const volume = catalog.volumes.find((volume) => volume.id === context.vol);
    if (!volume) throw new Error("Missing volume for new arc");

    const arcNumber = nextNumber(
      volume.arcs.map((arc) => arc.id),
      "arc",
    );
    created = {
      vol: volume.id,
      arc: `arc-${arcNumber}-${sanitizeTitle(title, "new-arc")}`,
      chapter: "ch-1",
    };
    volTitle = volume.title;
    volOrder = parseOrder(volume.id, "vol");
    arcTitle = titleFromSegment(created.arc, "Arc");
    arcOrder = arcNumber;
  } else {
    const volume = catalog.volumes.find((volume) => volume.id === context.vol);
    const arc = volume?.arcs.find((catalogArc) => catalogArc.id === context.arc);
    if (!volume || !arc) throw new Error("Missing arc for new chapter");

    const chapterNumber = nextNumber(
      arc.chapters.map((chapter) => chapter.chapter),
      "ch",
    );
    created = {
      vol: volume.id,
      arc: arc.id,
      chapter: `ch-${chapterNumber}`,
    };
    volTitle = volume.title;
    volOrder = parseOrder(volume.id, "vol");
    arcTitle = arc.title;
    arcOrder = parseOrder(arc.id, "arc");
  }

  const chapterTitle = titleFromSegment(created.chapter, "Chapter");
  await setDoc(
    doc(getFirebaseDb(), CHAPTERS_COLLECTION, documentId(created.vol, created.arc, created.chapter)),
    {
      volId: created.vol,
      volTitle,
      volOrder,
      arcId: created.arc,
      arcTitle,
      arcOrder,
      chapterId: created.chapter,
      chapterTitle,
      chapterOrder: parseOrder(created.chapter, "ch"),
      content: `# ${chapterTitle}\n\n`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );

  return created;
}

export async function deleteEntry(
  type: CreateEntryType,
  context: { vol?: string; arc?: string; chapter?: string },
) {
  const db = getFirebaseDb();

  if (type === "chapter") {
    if (!context.vol || !context.arc || !context.chapter) {
      throw new Error("Missing chapter to delete");
    }

    await deleteDoc(
      doc(db, CHAPTERS_COLLECTION, documentId(context.vol, context.arc, context.chapter)),
    );
    return;
  }

  if (!context.vol) throw new Error("Missing volume to delete");

  const constraints =
    type === "arc"
      ? [
          where("volId", "==", context.vol),
          where("arcId", "==", context.arc ?? ""),
        ]
      : [where("volId", "==", context.vol)];
  const snapshot = await getDocs(
    query(collection(db, CHAPTERS_COLLECTION), ...constraints),
  );
  const batch = writeBatch(db);

  snapshot.forEach((chapterSnapshot) => batch.delete(chapterSnapshot.ref));
  await batch.commit();
}

export async function renameEntry(
  catalog: Catalog,
  type: CreateEntryType,
  context: { vol?: string; arc?: string; chapter?: string },
  title: string,
) {
  const db = getFirebaseDb();

  if (type === "chapter") {
    if (!context.vol || !context.arc || !context.chapter) {
      throw new Error("Missing chapter to rename");
    }

    const nextChapter = renameSegment(context.chapter, "ch", title);
    const oldReference = doc(
      db,
      CHAPTERS_COLLECTION,
      documentId(context.vol, context.arc, context.chapter),
    );
    const snapshot = await getDoc(oldReference);
    if (!snapshot.exists()) throw new Error("Chapter not found");

    const current = normalizeChapterDocument(
      snapshot.data() as Partial<ChapterDocument>,
    );
    const batch = writeBatch(db);
    batch.set(doc(db, CHAPTERS_COLLECTION, documentId(context.vol, context.arc, nextChapter)), {
      ...current,
      chapterId: nextChapter,
      chapterTitle: titleFromSegment(nextChapter, "Chapter"),
      chapterOrder: parseOrder(nextChapter, "ch"),
      updatedAt: serverTimestamp(),
    });
    batch.delete(oldReference);
    await batch.commit();

    return { vol: context.vol, arc: context.arc, chapter: nextChapter };
  }

  if (!context.vol) throw new Error("Missing volume to rename");

  const volume = catalog.volumes.find((volume) => volume.id === context.vol);
  const nextVol =
    type === "volume" ? renameSegment(context.vol, "vol", title) : context.vol;
  const nextArc =
    type === "arc" && context.arc
      ? renameSegment(context.arc, "arc", title)
      : context.arc;
  const nextVolTitle =
    type === "volume" ? titleFromSegment(nextVol, "Volume") : volume?.title;
  const nextArcTitle =
    type === "arc" && nextArc ? titleFromSegment(nextArc, "Arc") : undefined;
  const constraints =
    type === "arc"
      ? [
          where("volId", "==", context.vol),
          where("arcId", "==", context.arc ?? ""),
        ]
      : [where("volId", "==", context.vol)];
  const snapshot = await getDocs(
    query(collection(db, CHAPTERS_COLLECTION), ...constraints),
  );
  const batch = writeBatch(db);

  snapshot.forEach((chapterSnapshot) => {
    const current = normalizeChapterDocument(
      chapterSnapshot.data() as Partial<ChapterDocument>,
    );
    const renamed = {
      ...current,
      volId: nextVol,
      volTitle: nextVolTitle ?? current.volTitle,
      volOrder: parseOrder(nextVol, "vol"),
      arcId: type === "arc" && nextArc ? nextArc : current.arcId,
      arcTitle:
        type === "arc" && nextArcTitle ? nextArcTitle : current.arcTitle,
      arcOrder:
        type === "arc" && nextArc ? parseOrder(nextArc, "arc") : current.arcOrder,
      updatedAt: serverTimestamp(),
    };

    batch.set(
      doc(db, CHAPTERS_COLLECTION, documentId(renamed.volId, renamed.arcId, renamed.chapterId)),
      renamed,
    );
    batch.delete(chapterSnapshot.ref);
  });

  await batch.commit();

  return {
    vol: nextVol,
    arc: type === "arc" && nextArc ? nextArc : (context.arc ?? ""),
    chapter: context.chapter ?? "",
  };
}
