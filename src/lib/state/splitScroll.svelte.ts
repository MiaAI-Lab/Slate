class SplitScrollState {
  /** 1-based line at the top of the editor's viewport. */
  editorTopLine = $state(1)
  /** True while preview is scripting its own scroll (suppress reverse). */
  programmaticScroll = $state(false)
}

export const splitScroll = new SplitScrollState()
