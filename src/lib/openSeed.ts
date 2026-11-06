/**
 * A random number chosen once each time the app is opened (page load or app launch). The home screen
 * uses it to choose its picks, so every opening shows something different, while moving around the app
 * keeps the picks steady.
 */
export const OPEN_SEED: number = (() => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]
  } catch {
    return Math.floor(Math.random() * 2 ** 32)
  }
})()
