// store.js — the only place the site saves anything. localStorage now; a backend could replace it later.
const Store = {
  // Read a saved value; return the fallback if storage is blocked or empty (private windows throw).
  get(key, fallback) {
    try {
      const v = localStorage.getItem("ezbet:" + key); // prefix keeps our keys separate from other sites' keys
      return v === null ? fallback : v;                // nothing saved yet -> use the fallback
    } catch (e) {
      return fallback;                                 // storage unavailable -> the page still works without it
    }
  },
  // Save a value; silently skip if storage is blocked, because nothing here is essential.
  set(key, value) {
    try {
      localStorage.setItem("ezbet:" + key, value);
    } catch (e) { /* ignore: remembering the last search is a convenience only */ }
  }
};
