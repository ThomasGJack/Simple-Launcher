import { useMemo } from "react";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

type Props = {
  html: string;
  className?: string;
  style?: React.CSSProperties;
};

export function SafeHtml({ html, className, style }: Props) {
  const sanitized = useMemo(() => sanitizeHtml(html), [html]);
  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
