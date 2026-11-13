/**
 * In-memory SessionStorage Mock conforming to Web Storage API.
 * Provides testing hooks for private-mode failure simulation and storage events.
 */

class SessionStorageMock {
  constructor() {
    this.store = new Map();
    this.disabled = false;
  }

  setDisabled(disabled) {
    this.disabled = Boolean(disabled);
  }

  getItem(key) {
    if (this.disabled) {
      throw new DOMException('The operation is insecure (Private Browsing Mode)', 'SecurityError');
    }
    const k = String(key);
    return this.store.has(k) ? this.store.get(k) : null;
  }

  setItem(key, value) {
    if (this.disabled) {
      throw new DOMException('The operation is insecure (Private Browsing Mode)', 'SecurityError');
    }
    const k = String(key);
    const v = String(value);
    this.store.set(k, v);
  }

  removeItem(key) {
    if (this.disabled) {
      throw new DOMException('The operation is insecure (Private Browsing Mode)', 'SecurityError');
    }
    const k = String(key);
    this.store.delete(k);
  }

  clear() {
    if (this.disabled) {
      throw new DOMException('The operation is insecure (Private Browsing Mode)', 'SecurityError');
    }
    this.store.clear();
  }

  get length() {
    if (this.disabled) {
      throw new DOMException('The operation is insecure (Private Browsing Mode)', 'SecurityError');
    }
    return this.store.size;
  }

  key(index) {
    if (this.disabled) {
      throw new DOMException('The operation is insecure (Private Browsing Mode)', 'SecurityError');
    }
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }
}

module.exports = { SessionStorageMock };
