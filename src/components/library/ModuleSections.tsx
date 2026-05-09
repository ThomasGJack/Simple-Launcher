import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Newspaper, Image as ImageIcon, Activity, Code } from "lucide-react";
import { getFirebase } from "@/firebase/config";
import type { LauncherModule, ModulePageV1, PageSection } from "@/types/module";
import { isModulePageV2 } from "@/types/module";

export function ModuleSections({ module }: { module: LauncherModule }) {
  const page = module.page;
  const sections: PageSection[] =
    page && !isModulePageV2(page) ? ((page as ModulePageV1).sections ?? []) : [];
  const showAutoChangelog = module.type === "hosted";
  if (sections.length === 0 && !showAutoChangelog) return null;

  return (
    <div className="space-y-8">
      {sections.map((section, idx) => (
        <motion.div
          key={`${section.type}-${idx}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * idx }}
        >
          <SectionRenderer section={section} />
        </motion.div>
      ))}
      {showAutoChangelog && <AutoChangelog moduleId={module.id} />}
    </div>
  );
}

function SectionRenderer({ section }: { section: PageSection }) {
  switch (section.type) {
    case "screenshots-grid":
      return <ScreenshotsGrid images={section.images} />;
    case "stats":
      return <StatsSection data={section.data} />;
    case "carousel":
      return <CarouselSection slides={section.slides} interval={section.interval} />;
    case "changelog":
      return <ChangelogSection entries={section.entries} />;
    case "custom-html":
      return <CustomHtml content={section.content} />;
  }
}

function SectionHeader({ icon: Icon, title }: { icon: typeof ImageIcon; title: string }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
      <Icon className="size-3" />
      {title}
    </div>
  );
}

function ScreenshotsGrid({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <div>
      <SectionHeader icon={ImageIcon} title="Captures d'écran" />
      <div className="grid grid-cols-3 gap-3">
        {images.map((url, i) => (
          <motion.button
            key={url + i}
            whileHover={{ scale: 1.02 }}
            onClick={() => {
              // Lightbox intégrée — l'app reste l'app, pas une page
              // qui s'ouvre dans le browser de l'OS.
              void import("@/store/imageViewer").then(({ openImage }) =>
                openImage(url, `Capture ${i + 1}`),
              );
            }}
            className="group aspect-video overflow-hidden rounded-xl ring-1 ring-white/[0.06] transition-shadow hover:ring-accent/30 hover:shadow-[0_0_24px_var(--color-accent-soft)]"
          >
            <img
              src={url}
              alt=""
              className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function StatsSection({ data }: { data: { label: string; value: string }[] }) {
  if (data.length === 0) return null;
  return (
    <div>
      <SectionHeader icon={Activity} title="Stats" />
      <div className="grid grid-cols-4 gap-3">
        {data.map((stat, i) => (
          <div key={i} className="rounded-xl glass p-4">
            <div className="font-display text-2xl text-fg-primary">{stat.value}</div>
            <div className="mt-1 text-xs uppercase tracking-wider text-fg-muted">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CarouselSection({
  slides,
  interval = 5000,
}: {
  slides: { image?: string; video?: string; title?: string; subtitle?: string }[];
  interval?: number;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), interval);
    return () => clearInterval(t);
  }, [slides.length, interval]);

  if (slides.length === 0) return null;
  const slide = slides[index];

  return (
    <div className="relative aspect-[21/9] overflow-hidden rounded-2xl ring-1 ring-white/[0.06]">
      {slide.video ? (
        <video src={slide.video} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
      ) : slide.image ? (
        <img src={slide.image} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-fuchsia-500/20" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg-base/90 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6">
        {slide.title && <h3 className="font-display text-3xl text-fg-primary">{slide.title}</h3>}
        {slide.subtitle && <p className="mt-1 text-sm text-fg-muted">{slide.subtitle}</p>}
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-accent" : "w-1.5 bg-white/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangelogSection({
  entries,
}: {
  entries: { version: string; date: string; notes: string[] }[];
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <SectionHeader icon={Newspaper} title="Changelog" />
      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.version} className="rounded-xl glass p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-display text-lg text-accent">v{entry.version}</span>
              <span className="text-xs text-fg-dim">{entry.date}</span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
              {entry.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomHtml({ content }: { content: string }) {
  return (
    <div>
      <SectionHeader icon={Code} title="Détails" />
      <div
        className="prose-invert max-w-none rounded-2xl glass p-6 text-sm text-fg-muted"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}

function AutoChangelog({ moduleId }: { moduleId: string }) {
  const [versions, setVersions] = useState<{ version: string; releasedAt: number }[]>([]);

  useEffect(() => {
    const fb = getFirebase();
    if (!fb) return;
    const q = query(collection(fb.db, "modules", moduleId, "versions"), orderBy("releasedAt", "desc"));
    return onSnapshot(q, (snap) => {
      setVersions(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            version: d.id,
            releasedAt: data.releasedAt?.toMillis?.() ?? 0,
          };
        }),
      );
    });
  }, [moduleId]);

  if (versions.length === 0) return null;
  return (
    <div>
      <SectionHeader icon={Newspaper} title="Versions publiées" />
      <div className="space-y-2">
        {versions.map((v) => (
          <div key={v.version} className="flex items-center justify-between rounded-xl glass px-4 py-3">
            <span className="font-display text-base text-accent">v{v.version}</span>
            <span className="text-xs text-fg-muted">
              {v.releasedAt
                ? new Date(v.releasedAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
