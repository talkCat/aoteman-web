/**
 * 极小的 remark 插件：把正文中的 [K1] 拆成链接节点（#citation-k1）。
 *
 * 为什么不用字符串 replace：replace 会误伤代码块与链接文本，且需要
 * dangerouslySetInnerHTML。这里只遍历 text 节点，并且跳过 code / inlineCode / link 子树。
 * 设计依据：任务拆解 F-13 第 1 步。
 */

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const CITATION_PATTERN = /\[K(\d+)\]/g;

function splitTextNode(value: string, refs: Set<string>): MdNode[] | null {
  const pattern = new RegExp(CITATION_PATTERN.source, 'g');
  const nodes: MdNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const ref = `K${match[1]}`;
    if (!refs.has(ref)) continue;

    if (match.index > cursor) {
      nodes.push({ type: 'text', value: value.slice(cursor, match.index) });
    }
    nodes.push({
      type: 'link',
      url: `#citation-${ref.toLowerCase()}`,
      children: [{ type: 'text', value: ref }],
    });
    cursor = match.index + match[0].length;
  }

  if (nodes.length === 0) return null;
  if (cursor < value.length) {
    nodes.push({ type: 'text', value: value.slice(cursor) });
  }
  return nodes;
}

function walk(node: MdNode, refs: Set<string>, insideLink: boolean) {
  if (!node.children) return;

  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && !insideLink && typeof child.value === 'string') {
      const parts = splitTextNode(child.value, refs);
      if (parts) {
        next.push(...parts);
        continue;
      }
    }

    // 代码块、行内代码和链接内部不做替换：链接不能嵌套链接，代码里的 [K1] 也不是引用。
    if (child.type !== 'code' && child.type !== 'inlineCode') {
      walk(child, refs, insideLink || child.type === 'link');
    }
    next.push(child);
  }

  node.children = next;
}

export function remarkCitations(options: { refs: string[] }) {
  const refs = new Set(options.refs);
  return (tree: MdNode) => {
    if (refs.size > 0) walk(tree, refs, false);
  };
}