import { cn } from "@/lib/cn";
import type { VideoEmbedProps } from "@/types/moduleBlocks";

const ASPECT: Record<NonNullable<VideoEmbedProps["aspect"]>, string> = {
  "16/9": "aspect-video",
  "21/9": "aspect-[21/9]",
  "4/3": "aspect-[4/3]",
  "9/16": "aspect-[9/16] mx-auto max-w-sm",
};

function buildIframeUrl(props: VideoEmbedProps): string | null {
  const { provider, urlOrId, autoplay, mute, loop, controls } = props;
  switch (provider) {
    case "youtube": {
      const id = extractYoutubeId(urlOrId);
      if (!id) return null;
      const params = new URLSearchParams({
        autoplay: autoplay ? "1" : "0",
        mute: mute ? "1" : "0",
        loop: loop ? "1" : "0",
        controls: controls === false ? "0" : "1",
        rel: "0",
      });
      if (loop) params.set("playlist", id);
      return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
    }
    case "vimeo": {
      const id = urlOrId.replace(/[^0-9]/g, "");
      if (!id) return null;
      const params = new URLSearchParams({
        autoplay: autoplay ? "1" : "0",
        muted: mute ? "1" : "0",
        loop: loop ? "1" : "0",
      });
      return `https://player.vimeo.com/video/${id}?${params.toString()}`;
    }
    case "twitch": {
      const params = new URLSearchParams({
        channel: urlOrId,
        parent: window.location.hostname,
        autoplay: autoplay ? "true" : "false",
        muted: mute ? "true" : "false",
      });
      return `https://player.twitch.tv/?${params.toString()}`;
    }
    case "mp4":
    default:
      return null;
  }
}

function extractYoutubeId(s: string): string | null {
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1);
    if (url.searchParams.has("v")) return url.searchParams.get("v");
    const m = url.pathname.match(/\/embed\/([\w-]{11})/);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return null;
}

export function BlockVideoEmbed(props: VideoEmbedProps) {
  const aspect = ASPECT[props.aspect ?? "16/9"];

  if (props.provider === "mp4") {
    if (!props.urlOrId) {
      return (
        <div className={cn("rounded-2xl border border-dashed border-white/10", aspect)}>
          <div className="flex size-full items-center justify-center text-sm text-fg-muted">URL vidéo manquante</div>
        </div>
      );
    }
    return (
      <div className={cn("overflow-hidden rounded-2xl ring-1 ring-white/[0.06]", aspect)}>
        <video
          src={props.urlOrId}
          autoPlay={props.autoplay}
          muted={props.mute}
          loop={props.loop}
          controls={props.controls !== false}
          playsInline
          className="size-full object-cover"
        />
      </div>
    );
  }

  const src = buildIframeUrl(props);
  if (!src) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-white/10", aspect)}>
        <div className="flex size-full items-center justify-center text-sm text-fg-muted">URL invalide</div>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl ring-1 ring-white/[0.06]", aspect)}>
      <iframe
        src={src}
        title="video"
        className="size-full"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
