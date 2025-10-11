import type { DetailedHTMLProps, HTMLAttributes } from 'react';

// Import the element classes exported by the package so we can use their types
import type { VscodeBadge } from '@vscode-elements/elements/dist/vscode-badge/vscode-badge';
import type { VscodeButton } from '@vscode-elements/elements/dist/vscode-button/vscode-button';
import type { VscodeCollapsible } from '@vscode-elements/elements/dist/vscode-collapsible/vscode-collapsible';
import type { VscodeIcon } from '@vscode-elements/elements/dist/vscode-icon/vscode-icon';
import type { VscodePanel } from '@vscode-elements/elements/dist/vscode-panel/vscode-panel';
import type { VscodeProgressRing } from '@vscode-elements/elements/dist/vscode-progress-ring/vscode-progress-ring';
import type { VscodeTable } from '@vscode-elements/elements/dist/vscode-table/vscode-table';
import type { VscodeTableHeader } from '@vscode-elements/elements/dist/vscode-table-header/vscode-table-header';
import type { VscodeTableHeaderCell } from '@vscode-elements/elements/dist/vscode-table-header-cell/vscode-table-header-cell';
import type { VscodeTableBody } from '@vscode-elements/elements/dist/vscode-table-body/vscode-table-body';
import type { VscodeTableRow } from '@vscode-elements/elements/dist/vscode-table-row/vscode-table-row';
import type { VscodeTableCell } from '@vscode-elements/elements/dist/vscode-table-cell/vscode-table-cell';
import type { VscodeTooltip } from '@vscode-elements/elements/dist/vscode-tooltip/vscode-tooltip';
import type { VscodeTag } from '@vscode-elements/elements/dist/vscode-tag/vscode-tag';
import { VscodeCollapsible } from '@vscode-elements/elements/dist/vscode-collapsible';

type DetailedProps<E> = DetailedHTMLProps<HTMLAttributes<E>, E> & { [key: string]: unknown };

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'vscode-badge': DetailedProps<VscodeBadge>;
      'vscode-button': DetailedProps<VscodeButton>;
      'vscode-collapsible': DetailedProps<VscodeCollapsible>;
      'vscode-icon': DetailedProps<VscodeIcon>;
      'vscode-panel': DetailedProps<VscodePanel>;
      'vscode-progress-ring': DetailedProps<VscodeProgressRing>;
      'vscode-table': DetailedProps<VscodeTable>;
      'vscode-table-header': DetailedProps<VscodeTableHeader>;
      'vscode-table-header-cell': DetailedProps<VscodeTableHeaderCell>;
      'vscode-table-body': DetailedProps<VscodeTableBody>;
      'vscode-table-row': DetailedProps<VscodeTableRow>;
      'vscode-table-cell': DetailedProps<VscodeTableCell>;
      'vscode-tooltip': DetailedProps<VscodeTooltip>;
      'vscode-tag': DetailedProps<VscodeTag>;
    }
  }
}

export {};
