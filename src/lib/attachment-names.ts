// Los nombres de los adjuntos se guardan al final del mensaje: "texto\n\n📎 a.pdf · b.png"
const MARK = "📎 ";
const SEP = " · ";

export function withAttachmentNames(text: string, names: string[]) {
  if (!names.length) return text;
  return `${text}${text ? "\n\n" : ""}${MARK}${names.join(SEP)}`;
}

export function splitAttachmentNames(content: string): { text: string; names: string[] } {
  const i = content.lastIndexOf(MARK);
  if (i === -1 || content.slice(i).includes("\n") || (i > 0 && !content.slice(0, i).endsWith("\n\n"))) {
    return { text: content, names: [] };
  }
  return { text: content.slice(0, i).trimEnd(), names: content.slice(i + MARK.length).split(SEP) };
}
