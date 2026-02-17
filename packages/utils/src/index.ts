export { hashString } from './common/strings';
export { generateIcon, type ProjectIcon } from './common/icon';
export type { RichTextAST, RichTextNode } from './common/content';
export { renderRichTextNode, renderTextNode } from './common/content-renderer';
export {
  glitchText,
  useGlitchOnLoad,
  useClockGlitch,
  useCoffeeGlitch,
  useSkillRotation,
  useCursorTrail,
} from './hooks/glitch-effects';
