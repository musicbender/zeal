import type { RichTextNode } from './content';

export function renderTextNode(node: RichTextNode, i: number): React.ReactNode {
  if (node.text != null) {
    let content: React.ReactNode = node.text;
    if (node.bold) content = <strong key={i}>{content}</strong>;
    if (node.italic) content = <em key={i}>{content}</em>;
    if (node.underline) content = <u key={i}>{content}</u>;
    return content;
  }
  return null;
}

export function renderRichTextNode(node: RichTextNode, i: number): React.ReactNode {
  if (node.type === 'paragraph') {
    const content = node.children?.map((child, j) => renderTextNode(child, j));
    if (node.children?.length === 1 && node.children[0]?.text === '') return null;
    return <p key={i}>{content}</p>;
  }

  if (node.type === 'image') {
    return (
      <div key={i} className="rich-text-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={node.src}
          alt={node.altText || ''}
          width={node.width}
          height={node.height}
          loading="lazy"
        />
      </div>
    );
  }

  if (node.type === 'heading-two') {
    return <h2 key={i}>{node.children?.map((child, j) => renderTextNode(child, j))}</h2>;
  }

  if (node.type === 'heading-three') {
    return <h3 key={i}>{node.children?.map((child, j) => renderTextNode(child, j))}</h3>;
  }

  if (node.type === 'bulleted-list') {
    return (
      <ul key={i}>{node.children?.map((child, j) => renderRichTextNode(child, j))}</ul>
    );
  }

  if (node.type === 'numbered-list') {
    return (
      <ol key={i}>{node.children?.map((child, j) => renderRichTextNode(child, j))}</ol>
    );
  }

  if (node.type === 'list-item') {
    return (
      <li key={i}>{node.children?.map((child, j) => renderRichTextNode(child, j))}</li>
    );
  }

  if (node.type === 'list-item-child') {
    return node.children?.map((child, j) => renderTextNode(child, j));
  }

  if (node.type === 'link') {
    return (
      <a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
        {node.children?.map((child, j) => renderTextNode(child, j))}
      </a>
    );
  }

  if (node.type === 'class' && node.children) {
    return node.children.map((child, j) => renderRichTextNode(child, j));
  }

  return null;
}
