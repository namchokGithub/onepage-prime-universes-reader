import path from "node:path";
import { promises as fs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

type CreateEntryPayload = {
  type?: "volume" | "arc" | "chapter";
  title?: string;
  vol?: string;
  arc?: string;
};

type DeleteEntryPayload = {
  type?: "volume" | "arc" | "chapter";
  vol?: string;
  arc?: string;
  chapter?: string;
};

type RenameEntryPayload = DeleteEntryPayload & {
  title?: string;
};

type CreatedEntry = {
  vol: string;
  arc: string;
  chapter: string;
};

function readJsonBody<T>(req: IncomingMessage) {
  return new Promise<T>((resolve, reject) => {
    let body = "";

    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
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
  const match = segment.match(new RegExp(`^${prefix}-(\\d+)(?:-|$)`, "i"));

  if (!match) {
    throw new Error(`Invalid ${prefix} segment`);
  }

  return `${prefix}-${Number(match[1])}-${sanitizeTitle(title, `new-${prefix}`)}`;
}

async function readDirNames(dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    return entries.map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function getFirstChapterPath(contentRoot: string) {
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const volumes = (await readDirNames(contentRoot))
    .filter((name) => name.startsWith("vol-"))
    .sort(collator.compare);

  for (const vol of volumes) {
    const volPath = resolveContentPath(contentRoot, vol);
    const arcs = (await readDirNames(volPath))
      .filter((name) => name.startsWith("arc-"))
      .sort(collator.compare);

    for (const arc of arcs) {
      const arcPath = resolveContentPath(contentRoot, vol, arc);
      const chapter = (await readDirNames(arcPath))
        .filter((name) => /^ch-.+\.md$/i.test(name))
        .sort(collator.compare)[0];

      if (chapter) {
        return `/editor/${vol}/${arc}/${chapter.replace(/\.md$/i, "")}`;
      }
    }
  }

  return "/editor";
}

function resolveContentPath(contentRoot: string, ...segments: string[]) {
  const targetPath = path.resolve(contentRoot, ...segments);
  const relativePath = path.relative(contentRoot, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid content path");
  }

  return targetPath;
}

function editorSavePlugin(): Plugin {
  const contentRoot = path.resolve(__dirname, "src/content");

  return {
    name: "editor-save",
    configureServer(server) {
      server.middlewares.use("/__editor/save-chapter", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const { vol, arc, chapter, content } = await readJsonBody<{
            vol?: string;
            arc?: string;
            chapter?: string;
            content?: string;
          }>(req);

          if (!vol || !arc || !chapter || typeof content !== "string") {
            res.statusCode = 400;
            res.end("Invalid chapter payload");
            return;
          }

          const filePath = resolveContentPath(contentRoot, vol, arc, `${chapter}.md`);

          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, content, "utf8");
          res.statusCode = 204;
          res.end();
        } catch {
          res.statusCode = 500;
          res.end("Unable to save chapter");
        }
      });

      server.middlewares.use("/__editor/create-entry", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const payload = await readJsonBody<CreateEntryPayload>(req);
          let created: CreatedEntry;

          if (payload.type === "volume") {
            const volumeNumber = nextNumber(await readDirNames(contentRoot), "vol");
            const vol = `vol-${volumeNumber}-${sanitizeTitle(
              payload.title,
              "new-volume",
            )}`;
            created = { vol, arc: "arc-1-new-arc", chapter: "ch-1" };
          } else if (payload.type === "arc") {
            if (!payload.vol) {
              sendJson(res, 400, { message: "Missing volume for new arc" });
              return;
            }

            const arcRoot = resolveContentPath(contentRoot, payload.vol);
            const arcNumber = nextNumber(await readDirNames(arcRoot), "arc");
            created = {
              vol: payload.vol,
              arc: `arc-${arcNumber}-${sanitizeTitle(payload.title, "new-arc")}`,
              chapter: "ch-1",
            };
          } else if (payload.type === "chapter") {
            if (!payload.vol || !payload.arc) {
              sendJson(res, 400, { message: "Missing arc for new chapter" });
              return;
            }

            const chapterRoot = resolveContentPath(contentRoot, payload.vol, payload.arc);
            const files = (await readDirNames(chapterRoot)).map((fileName) =>
              fileName.replace(/\.md$/i, ""),
            );
            const chapterNumber = nextNumber(files, "ch");

            created = {
              vol: payload.vol,
              arc: payload.arc,
              chapter: `ch-${chapterNumber}`,
            };
          } else {
            sendJson(res, 400, { message: "Invalid entry type" });
            return;
          }

          const filePath = resolveContentPath(
            contentRoot,
            created.vol,
            created.arc,
            `${created.chapter}.md`,
          );
          const chapterTitle = created.chapter.replace(/^ch-(\d+)$/i, "Chapter $1");

          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, `# ${chapterTitle}\n\n`, {
            encoding: "utf8",
            flag: "wx",
          });
          server.moduleGraph.invalidateAll();
          sendJson(res, 201, created);
        } catch (error) {
          const message =
            (error as NodeJS.ErrnoException).code === "EEXIST"
              ? "Chapter already exists"
              : "Unable to create entry";

          sendJson(res, 500, { message });
        }
      });

      server.middlewares.use("/__editor/delete-entry", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const payload = await readJsonBody<DeleteEntryPayload>(req);
          let targetPath: string;

          if (payload.type === "volume") {
            if (!payload.vol) {
              sendJson(res, 400, { message: "Missing volume to delete" });
              return;
            }

            targetPath = resolveContentPath(contentRoot, payload.vol);
          } else if (payload.type === "arc") {
            if (!payload.vol || !payload.arc) {
              sendJson(res, 400, { message: "Missing arc to delete" });
              return;
            }

            targetPath = resolveContentPath(contentRoot, payload.vol, payload.arc);
          } else if (payload.type === "chapter") {
            if (!payload.vol || !payload.arc || !payload.chapter) {
              sendJson(res, 400, { message: "Missing chapter to delete" });
              return;
            }

            targetPath = resolveContentPath(
              contentRoot,
              payload.vol,
              payload.arc,
              `${payload.chapter}.md`,
            );
          } else {
            sendJson(res, 400, { message: "Invalid entry type" });
            return;
          }

          await fs.rm(targetPath, { recursive: true, force: true });
          server.moduleGraph.invalidateAll();
          sendJson(res, 200, {
            ok: true,
            nextEditorPath: await getFirstChapterPath(contentRoot),
          });
        } catch {
          sendJson(res, 500, { message: "Unable to delete entry" });
        }
      });

      server.middlewares.use("/__editor/rename-entry", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const payload = await readJsonBody<RenameEntryPayload>(req);
          let sourcePath: string;
          let targetPath: string;
          let renamed: CreatedEntry;

          if (payload.type === "volume") {
            if (!payload.vol) {
              sendJson(res, 400, { message: "Missing volume to rename" });
              return;
            }

            const nextVol = renameSegment(payload.vol, "vol", payload.title);
            sourcePath = resolveContentPath(contentRoot, payload.vol);
            targetPath = resolveContentPath(contentRoot, nextVol);
            renamed = {
              vol: nextVol,
              arc: payload.arc ?? "",
              chapter: payload.chapter ?? "",
            };
          } else if (payload.type === "arc") {
            if (!payload.vol || !payload.arc) {
              sendJson(res, 400, { message: "Missing arc to rename" });
              return;
            }

            const nextArc = renameSegment(payload.arc, "arc", payload.title);
            sourcePath = resolveContentPath(contentRoot, payload.vol, payload.arc);
            targetPath = resolveContentPath(contentRoot, payload.vol, nextArc);
            renamed = {
              vol: payload.vol,
              arc: nextArc,
              chapter: payload.chapter ?? "",
            };
          } else if (payload.type === "chapter") {
            if (!payload.vol || !payload.arc || !payload.chapter) {
              sendJson(res, 400, { message: "Missing chapter to rename" });
              return;
            }

            const nextChapter = renameSegment(payload.chapter, "ch", payload.title);
            sourcePath = resolveContentPath(
              contentRoot,
              payload.vol,
              payload.arc,
              `${payload.chapter}.md`,
            );
            targetPath = resolveContentPath(
              contentRoot,
              payload.vol,
              payload.arc,
              `${nextChapter}.md`,
            );
            renamed = {
              vol: payload.vol,
              arc: payload.arc,
              chapter: nextChapter,
            };
          } else {
            sendJson(res, 400, { message: "Invalid entry type" });
            return;
          }

          if (sourcePath !== targetPath) {
            try {
              await fs.access(targetPath);
              throw Object.assign(new Error("Entry already exists"), {
                code: "EEXIST",
              });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error;
              }
            }

            await fs.rename(sourcePath, targetPath);
          }

          server.moduleGraph.invalidateAll();
          sendJson(res, 200, renamed);
        } catch (error) {
          const message =
            (error as NodeJS.ErrnoException).code === "EEXIST"
              ? "A matching entry already exists"
              : "Unable to rename entry";

          sendJson(res, 500, { message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), editorSavePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
