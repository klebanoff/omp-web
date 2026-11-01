import type { JSX } from "react";
import type { TranscriptClasses } from "./classes";
import { imageSrc } from "./transcript";

export interface MessageImageProps {
  /** An image content block, a raw image object, or a URL string. */
  image: unknown;
  classes: TranscriptClasses;
  alt?: string;
}

/**
 * Renders an allowed image source. Unsupported or malformed sources degrade to
 * a textual placeholder instead of a broken <img>.
 */
export function MessageImage({ image, classes, alt = "attached image" }: MessageImageProps): JSX.Element {
  const src = imageSrc(image);
  if (!src) {
    return (
      <span className={classes.imagePlaceholder} role="img" aria-label={`${alt} unavailable`}>
        image unavailable
      </span>
    );
  }
  return <img className={classes.image} src={src} alt={alt} loading="lazy" />;
}
