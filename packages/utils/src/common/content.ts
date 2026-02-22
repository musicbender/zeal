export interface RichTextAST {
  children: RichTextNode[];
}

export interface RichTextNode {
  type?: string;
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  children?: RichTextNode[];
  src?: string;
  altText?: string;
  title?: string;
  width?: number;
  height?: number;
  className?: string;
  href?: string;
}
