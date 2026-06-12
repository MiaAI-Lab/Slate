/// <reference types="svelte" />
/// <reference types="vite/client" />

declare const __APP_VERSION__: string

declare module '*.css?inline' {
  const css: string
  export default css
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export const gfm: TurndownService.Plugin
  export const tables: TurndownService.Plugin
  export const strikethrough: TurndownService.Plugin
  export const taskListItems: TurndownService.Plugin
}
