import { Setting } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { JSONObject, PartialJSONObject, Token } from '@lumino/coreutils';

/**
 * The token for the settings service.
 */
export const ISettings = new Token<ISettings>('@jupyterlite/settings:ISettings');

/**
 * The interface for the Settings service.
 */
export interface ISettings extends Setting.IManager {}

/**
 * The settings file to request
 */
export type SettingsFile = 'all.json' | 'all_federated.json';

/**
 * An interface for the plugin settings.
 */
export interface IPlugin extends PartialJSONObject {
  /**
   * The name of the plugin.
   */
  id: string;

  /**
   * The settings for the plugin.
   */
  settings: JSONObject;

  /**
   * The raw user settings data as a string containing JSON with comments.
   */
  raw: string;

  /**
   * The JSON schema for the plugin.
   */
  schema: ISettingRegistry.ISchema;

  /**
   * The published version of the NPM package containing the plugin.
   */
  version: string;
}
