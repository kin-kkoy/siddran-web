import { $getRoot } from 'lexical';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { remarkSpoiler, spoilerHandler } from './remarkSpoiler';
import { remarkUnderline, underlineHandler } from './remarkUnderline';
import { lexicalToMdast } from './lexicalToMdast';

// Frozen output style — must match the historical serializer's format so
// existing notes round-trip byte-for-byte after this migration.
const STRINGIFY_OPTIONS = {
  bullet: '-',
  emphasis: '*',
  strong: '*',
  fences: true,
  listItemIndent: 'one',
  tightDefinitions: true,
  handlers: { spoiler: spoilerHandler, underline: underlineHandler },
};

// Built once per module load — unified processors are reusable across calls.
const processor = unified()
  .use(remarkGfm)
  .use(remarkSpoiler)
  .use(remarkUnderline)
  .use(remarkStringify, STRINGIFY_OPTIONS);

// Same exported signature as before; AutosavePlugin and OnBlurPlugin do not
// need to change.
export function serializeEditorState(editorState) {
  const tree = editorState.read(() => lexicalToMdast($getRoot()));
  // remark-stringify always appends a trailing newline; trim it so saves
  // match the prior serializer's no-trailing-newline output.
  return processor.stringify(tree).replace(/\n$/, '');
}

// Serialize an arbitrary list of top-level block nodes to markdown, reusing the
// exact serializer (and output style) notes are saved with. `lexicalToMdast`
// only reads `getChildren()`, so we hand it a lightweight shim instead of a
// real root — no cloning needed. Caller must invoke inside an editor.read()/
// update() so the nodes are live. Used by "Copy as Markdown".
export function serializeNodesToMarkdown(blockNodes) {
  if (!Array.isArray(blockNodes) || blockNodes.length === 0) return '';
  const tree = lexicalToMdast({ getChildren: () => blockNodes });
  return processor.stringify(tree).replace(/\n$/, '');
}
