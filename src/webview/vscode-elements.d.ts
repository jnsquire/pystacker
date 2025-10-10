import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type VscodeElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  class?: string;
  slot?: string;
  appearance?: string;
  [key: string]: unknown;
};

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'vscode-button': VscodeElementProps;
      'vscode-panel': VscodeElementProps;
      'vscode-tag': VscodeElementProps;
      'vscode-tooltip': VscodeElementProps;
      'vscode-progress-ring': VscodeElementProps;
    }
  }
}

export {};
