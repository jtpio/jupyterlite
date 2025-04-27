// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ReactWidget } from '@jupyterlab/apputils';

import { ITranslator } from '@jupyterlab/translation';

import React from 'react';

/**
 * Interface for the clear options
 */
export interface IClearOptions {
  clearSettings: boolean;
  clearContents: boolean;
}

/**
 * Props for the ClearDataDialog component
 */
interface IClearDataDialogProps {
  translator: ITranslator;
  settingsChecked: boolean;
  contentsChecked: boolean;
  setSettingsChecked: (checked: boolean) => void;
  setContentsChecked: (checked: boolean) => void;
}

/**
 * A React component for displaying a dialog to clear browser data
 */
function ClearDataDialogComponent(props: IClearDataDialogProps): JSX.Element {
  const {
    translator,
    settingsChecked,
    contentsChecked,
    setSettingsChecked,
    setContentsChecked,
  } = props;

  const trans = translator.load('@jupyterlite');

  return (
    <div className="jp-ClearData-container">
      <p>
        {trans.__(
          'Clearing browser data will remove data stored in your browser. ' +
            'This operation cannot be undone.',
        )}
      </p>

      <div className="jp-ClearData-option">
        <input
          id="jp-ClearData-settings"
          type="checkbox"
          checked={settingsChecked}
          onChange={(e) => setSettingsChecked(e.target.checked)}
        />
        <label htmlFor="jp-ClearData-settings">
          {trans.__('Settings and preferences')}
        </label>
      </div>

      <div className="jp-ClearData-option">
        <input
          id="jp-ClearData-contents"
          type="checkbox"
          checked={contentsChecked}
          onChange={(e) => setContentsChecked(e.target.checked)}
        />
        <label htmlFor="jp-ClearData-contents">{trans.__('Files and notebooks')}</label>
      </div>

      <div className="jp-ClearData-warning">
        {trans.__('This will reload the page after clearing the selected data.')}
      </div>
    </div>
  );
}

/**
 * A widget for displaying a dialog to clear browser data
 */
export class ClearDataDialog extends ReactWidget {
  /**
   * Create a new clear data dialog
   *
   * @param translator - The translator instance
   */
  constructor(translator: ITranslator) {
    super();
    this._translator = translator;
    this._settingsChecked = true;
    this._contentsChecked = true;
    this.addClass('jp-ClearData-dialog');
  }

  /**
   * Get the current options selected by the user
   */
  getValue(): IClearOptions {
    return {
      clearSettings: this._settingsChecked,
      clearContents: this._contentsChecked,
    };
  }

  /**
   * Render the dialog content
   */
  protected render(): JSX.Element {
    return (
      <ClearDataDialogComponent
        translator={this._translator}
        settingsChecked={this._settingsChecked}
        contentsChecked={this._contentsChecked}
        setSettingsChecked={(checked: boolean) => {
          this._settingsChecked = checked;
          this.update();
        }}
        setContentsChecked={(checked: boolean) => {
          this._contentsChecked = checked;
          this.update();
        }}
      />
    );
  }

  private _translator: ITranslator;
  private _settingsChecked: boolean;
  private _contentsChecked: boolean;
}
