import { TableCellNode } from '@lexical/table';

// Extends @lexical/table's TableCellNode with a per-cell "no wrap" flag.
// We register it via Lexical's `replaceNodes` mechanism so any TableCellNode
// created internally by @lexical/table (INSERT_TABLE_COMMAND, the
// $createTableCellNode helper, the table reconciler) gets transparently
// upgraded to this subclass — no other code in the codebase needs to know
// about it.
//
// Persistence: __noWrap is preserved in Lexical's internal JSON state
// (across undo/redo and during the session) but is NOT round-tripped
// through markdown. GFM has no syntax for per-cell formatting, and we
// rejected polluting the markdown with raw HTML earlier (same trade-off
// as column widths and non-uniform alignment). On save+reload, every cell
// resets to wrapping (the default).
export class ExtendedTableCellNode extends TableCellNode {
  static getType() {
    return 'extended-table-cell';
  }

  static clone(node) {
    const cell = new ExtendedTableCellNode(
      node.__headerState,
      node.__colSpan,
      node.__width,
      node.__key
    );
    cell.__noWrap = node.__noWrap;
    cell.__backgroundColor = node.__backgroundColor;
    return cell;
  }

  constructor(headerState, colSpan, width, key) {
    super(headerState, colSpan, width, key);
    this.__noWrap = false;
  }

  setNoWrap(noWrap) {
    const self = this.getWritable();
    self.__noWrap = !!noWrap;
    return self;
  }

  getNoWrap() {
    return this.getLatest().__noWrap;
  }

  createDOM(config) {
    const dom = super.createDOM(config);
    if (this.__noWrap) dom.style.whiteSpace = 'nowrap';
    return dom;
  }

  updateDOM(prevNode, dom, config) {
    const baseUpdated = super.updateDOM(prevNode, dom, config);
    if (prevNode.__noWrap !== this.__noWrap) {
      dom.style.whiteSpace = this.__noWrap ? 'nowrap' : '';
      // Tell Lexical the DOM was meaningfully updated even if the base
      // returned false. Returning true is safe — it just means Lexical
      // won't recreate the element.
      return baseUpdated || true;
    }
    return baseUpdated;
  }

  static importJSON(serializedNode) {
    const cell = super.importJSON(serializedNode);
    if (serializedNode.noWrap) cell.__noWrap = true;
    return cell;
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'extended-table-cell',
      noWrap: this.__noWrap,
      version: 1,
    };
  }
}

export function $createExtendedTableCellNode(headerState, colSpan, width) {
  return new ExtendedTableCellNode(headerState, colSpan, width);
}
